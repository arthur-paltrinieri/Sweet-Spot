import "dotenv/config";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";
import { pool } from "./config/db";
import { authenticateToken, type AuthRequest } from "./middlewares/auth";

type AppRole = "praticante" | "treinador" | "admin";
type TrainingStatus = "rascunho" | "revisao" | "publicado";
type DbRow = Record<string, any>;
type WriteResult = { insertId: number; affectedRows: number };
type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

type HitPayload = {
  target_index: number;
  hit: boolean;
  accuracy: number;
  reaction_ms: number | null;
  event_id: string | null;
};

type ScoreSettings = {
  base_hit_points: number;
  streak_bonus_step: number;
  streak_bonus_cap: number;
  speed_fast_ms: number;
  speed_medium_ms: number;
  speed_fast_bonus: number;
  speed_medium_bonus: number;
};

type LiveState = {
  active_target_index: number | null;
  connected: boolean;
  updated_at: string;
  updated_ms: number;
};

const PORT = Number(process.env.PORT || 3333);
const JWT_SECRET = process.env.JWT_SECRET;
const ARENA_API_KEY = process.env.ARENA_API_KEY;
const MAX_TARGETS = 31;
const LIVE_TTL_MS = 12000;
const liveStates = new Map<string, LiveState>();

if (!JWT_SECRET) {
  throw new Error("Defina JWT_SECRET no arquivo .env da API.");
}

const app = express();
const configuredOrigins = (process.env.CORS_ORIGINS || "http://localhost:8080,http://localhost:5173,http://localhost:3000,http://127.0.0.1:8080,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origem não permitida pelo CORS."));
      }
    },
  }),
);
app.use(express.json({ limit: "1mb" }));

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function handle(handler: Handler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req as AuthRequest, res)).catch(next);
  };
}

async function findRows<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await pool.query(sql, params);
  return result as unknown as T[];
}

async function execute(sql: string, params: unknown[] = []): Promise<WriteResult> {
  const [result] = await pool.query(sql, params);
  return result as unknown as WriteResult;
}

function positiveId(value: unknown, label = "Identificador") {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw httpError(400, `${label} inválido.`);
  }
  return id;
}

function currentUserId(req: AuthRequest): number {
  return positiveId(req.user?.userId, "Usuário autenticado");
}

function roleValue(value: unknown): value is AppRole {
  return value === "praticante" || value === "treinador" || value === "admin";
}

function isTrainingStatus(value: unknown): value is TrainingStatus {
  return value === "rascunho" || value === "revisao" || value === "publicado";
}

function requiredText(value: unknown, label: string, maxLength: number, minLength = 1) {
  if (typeof value !== "string" || value.trim().length < minLength || value.trim().length > maxLength) {
    throw httpError(400, `${label} deve conter entre ${minLength} e ${maxLength} caracteres.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw httpError(400, `${label} inválido.`);
  }
  return value.trim();
}

function integerInRange(value: unknown, label: string, min: number, max: number) {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isInteger(number) || number < min || number > max) {
    throw httpError(400, `${label} deve estar entre ${min} e ${max}.`);
  }
  return number;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, "Data inválida. Use AAAA-MM-DD.");
  }
  const normalized = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(normalized.getTime()) || normalized.toISOString().slice(0, 10) !== value) {
    throw httpError(400, "Data inválida.");
  }
  return value;
}

function validLevel(value: unknown) {
  if (
    value !== "iniciante" &&
    value !== "intermediario" &&
    value !== "avancado" &&
    value !== "competitivo"
  ) {
    throw httpError(400, "Nível de tênis inválido.");
  }
  return value;
}

async function getDbUser(userId: number) {
  const [user] = await findRows("SELECT id, email, role FROM users WHERE id = ? LIMIT 1", [userId]);
  return user ?? null;
}

const requireRoles = (...roles: AppRole[]): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const user = await getDbUser(currentUserId(req as AuthRequest));
        if (!user) throw httpError(401, "Usuário não encontrado.");
        if (!roles.includes(user.role as AppRole)) throw httpError(403, "Acesso não autorizado.");
        next();
      })
      .catch(next);
  };
};

function verifyArenaKey(req: Request, res: Response, next: NextFunction) {
  if (!ARENA_API_KEY || ARENA_API_KEY.length < 24) {
    next(httpError(503, "Integração da arena não configurada no servidor."));
    return;
  }
  const received = req.header("x-arena-key") || "";
  const expectedBuffer = Buffer.from(ARENA_API_KEY);
  const actualBuffer = Buffer.from(received);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    next(httpError(401, "Chave da arena inválida."));
    return;
  }
  next();
}

async function requireSessionOwner(sessionId: number, userId: number) {
  const [session] = await findRows("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
  if (!session) throw httpError(404, "Sessão não encontrada.");
  const user = await getDbUser(userId);
  if (!user) throw httpError(401, "Usuário não encontrado.");
  if (user.role !== "admin" && Number(session.user_id) !== userId) {
    throw httpError(403, "Você não tem acesso a esta sessão.");
  }
  return session;
}

async function requireTrainingView(trainingId: number, userId: number) {
  const [training] = await findRows("SELECT * FROM trainings WHERE id = ? LIMIT 1", [trainingId]);
  if (!training) throw httpError(404, "Treino não encontrado.");
  const user = await getDbUser(userId);
  if (!user) throw httpError(401, "Usuário não encontrado.");
  if (user.role !== "admin" && Number(training.author_id) !== userId && training.status !== "publicado") {
    throw httpError(403, "Você não tem acesso a este treino.");
  }
  return { training, user };
}

async function requireTrainingEditor(trainingId: number, userId: number) {
  const { training, user } = await requireTrainingView(trainingId, userId);
  if (user.role !== "admin" && Number(training.author_id) !== userId) {
    throw httpError(403, "Apenas o autor ou um administrador pode alterar este treino.");
  }
  return { training, user };
}

async function requireStudentView(studentId: number, userId: number) {
  const [student] = await findRows(
    `SELECT p.*, u.role FROM profiles p JOIN users u ON u.id = p.id WHERE p.id = ? LIMIT 1`,
    [studentId],
  );
  if (!student || student.role !== "praticante") throw httpError(404, "Aluno não encontrado.");
  const user = await getDbUser(userId);
  if (!user) throw httpError(401, "Usuário não encontrado.");
  if (user.role !== "admin" && (user.role !== "treinador" || Number(student.coach_id) !== userId)) {
    throw httpError(403, "Este aluno não está vinculado ao seu perfil.");
  }
  return student;
}

function parseHit(body: unknown, targetCount: number): HitPayload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw httpError(400, "Dados da rebatida inválidos.");
  }
  const item = body as Record<string, unknown>;
  const target_index = integerInRange(item.target_index, "Índice do alvo", 0, Math.min(targetCount, MAX_TARGETS) - 1);
  if (item.hit !== true && item.hit !== false && item.hit !== 1 && item.hit !== 0) {
    throw httpError(400, "O campo hit deve ser booleano.");
  }
  const hit = item.hit === true || item.hit === 1;
  const accuracy = item.accuracy === null || item.accuracy === undefined
    ? hit ? 100 : 0
    : Number(item.accuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
    throw httpError(400, "Precisão da rebatida inválida.");
  }
  const reaction_ms = item.reaction_ms === null || item.reaction_ms === undefined
    ? null
    : Number(item.reaction_ms);
  if (reaction_ms !== null && (!Number.isInteger(reaction_ms) || reaction_ms < 0 || reaction_ms > 600000)) {
    throw httpError(400, "Tempo de reação inválido.");
  }
  const event_id = optionalText(item.event_id, "Identificador do evento", 100);
  return { target_index, hit, accuracy: hit ? accuracy : 0, reaction_ms, event_id };
}

async function scoreSettings(): Promise<ScoreSettings> {
  const defaults: ScoreSettings = {
    base_hit_points: 10,
    streak_bonus_step: 5,
    streak_bonus_cap: 5,
    speed_fast_ms: 600,
    speed_medium_ms: 900,
    speed_fast_bonus: 8,
    speed_medium_bonus: 4,
  };
  const settings = await findRows("SELECT `key`, `value` FROM system_settings WHERE `key` IN (?)", [Object.keys(defaults)]);
  for (const item of settings) {
    const key = item.key as keyof ScoreSettings;
    const number = Number(item.value);
    if (key in defaults && Number.isFinite(number) && number >= 0) defaults[key] = number;
  }
  return defaults;
}

function calculatePoints(hit: HitPayload, previousStreak: number, settings: ScoreSettings) {
  if (!hit.hit) return { points: 0, bonus: 0 };
  const base = Math.round(settings.base_hit_points * (hit.accuracy / 100));
  const streakBonus = Math.min(previousStreak, settings.streak_bonus_cap) * settings.streak_bonus_step;
  const speedBonus = hit.reaction_ms === null
    ? 0
    : hit.reaction_ms < settings.speed_fast_ms
      ? settings.speed_fast_bonus
      : hit.reaction_ms < settings.speed_medium_ms
        ? settings.speed_medium_bonus
        : 0;
  return { points: base + streakBonus + speedBonus, bonus: streakBonus + speedBonus };
}

app.get("/ping", (_req: Request, res: Response) => {
  res.json({ message: "Pong! API Smart Tennis Arena online." });
});

app.get("/test-db", handle(async (_req, res) => {
  const result = await findRows("SELECT 1 + 1 AS solution");
  res.json({ message: "Conectado ao MySQL com sucesso!", result });
}));

app.post(["/register", "/auth/register"], handle(async (req, res) => {
  const email = requiredText(req.body?.email, "E-mail", 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "E-mail inválido.");
  const password = req.body?.password;
  if (typeof password !== "string" || password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
    throw httpError(400, "A senha deve ter entre 6 e 72 bytes.");
  }
  const role = req.body?.role ?? "praticante";
  if (role !== "praticante" && role !== "treinador") {
    throw httpError(400, "Perfil de cadastro inválido.");
  }
  const fullName = requiredText(req.body?.full_name ?? req.body?.name, "Nome completo", 120, 2);
  const level = role === "praticante" ? validLevel(req.body?.level ?? "iniciante") : null;
  const institution = role === "treinador" ? optionalText(req.body?.institution, "Instituição", 120) : null;
  const passwordHash = await bcrypt.hash(password, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [insert] = await connection.query(
      "INSERT INTO users (email, password_hash, role, email_confirmed) VALUES (?, ?, ?, 1)",
      [email, passwordHash, role],
    );
    const userId = (insert as unknown as WriteResult).insertId;
    await connection.query(
      "INSERT INTO profiles (id, full_name, email, tennis_level, institution) VALUES (?, ?, ?, ?, ?)",
      [userId, fullName, email, level, institution],
    );
    await connection.commit();
    res.status(201).json({ message: "Usuário criado com sucesso!", userId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.post(["/login", "/auth/login"], handle(async (req, res) => {
  const email = requiredText(req.body?.email, "E-mail", 255).toLowerCase();
  const password = req.body?.password;
  if (typeof password !== "string" || password.length === 0) {
    throw httpError(400, "E-mail e senha são obrigatórios.");
  }
  const [user] = await findRows("SELECT id, email, role, password_hash FROM users WHERE email = ? LIMIT 1", [email]);
  if (!user || !(await bcrypt.compare(password, String(user.password_hash)))) {
    throw httpError(401, "Credenciais inválidas.");
  }
  const role: AppRole = roleValue(user.role) ? user.role : "praticante";
  const token = jwt.sign({ userId: user.id, email: user.email, role }, JWT_SECRET, { expiresIn: "7d" });
  res.json({
    message: "Login bem-sucedido",
    token,
    access_token: token,
    user: { id: user.id, email: user.email, role },
  });
}));

app.get("/me", authenticateToken, handle(async (req, res) => {
  const userId = currentUserId(req);
  const user = await getDbUser(userId);
  if (!user) throw httpError(401, "Usuário não encontrado.");
  const [profile] = await findRows(
    "SELECT id, full_name, email, tennis_level, institution, coach_id FROM profiles WHERE id = ? LIMIT 1",
    [userId],
  );
  if (!profile) throw httpError(404, "Perfil não encontrado.");
  res.json({ user: { id: user.id, email: user.email, role: user.role }, profile });
}));

app.put("/me", authenticateToken, handle(async (req, res) => {
  const userId = currentUserId(req);
  const changes: string[] = [];
  const values: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "full_name")) {
    changes.push("full_name = ?");
    values.push(requiredText(req.body.full_name, "Nome completo", 120, 2));
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "tennis_level")) {
    changes.push("tennis_level = ?");
    values.push(req.body.tennis_level === null ? null : validLevel(req.body.tennis_level));
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "institution")) {
    changes.push("institution = ?");
    values.push(optionalText(req.body.institution, "Instituição", 120));
  }
  if (changes.length === 0) throw httpError(400, "Nenhum campo válido para atualizar.");
  await execute(`UPDATE profiles SET ${changes.join(", ")} WHERE id = ?`, [...values, userId]);
  const [profile] = await findRows(
    "SELECT id, full_name, email, tennis_level, institution, coach_id FROM profiles WHERE id = ? LIMIT 1",
    [userId],
  );
  res.json({ message: "Perfil atualizado com sucesso!", profile });
}));

app.get("/treinos/gestao", authenticateToken, requireRoles("admin", "treinador"), (_req: Request, res: Response) => {
  res.json({ message: "Acesso à gestão de treinos autorizado." });
});

app.post("/trainings", authenticateToken, requireRoles("admin", "treinador"), handle(async (req, res) => {
  const authorId = currentUserId(req);
  const title = requiredText(req.body?.title, "Título", 120);
  const description = optionalText(req.body?.description, "Descrição", 5000) ?? "";
  const level = validLevel(req.body?.level ?? "iniciante");
  const difficulty = integerInRange(req.body?.difficulty ?? 2, "Dificuldade", 1, 5);
  const targetCount = integerInRange(req.body?.target_count ?? 6, "Quantidade de alvos", 1, MAX_TARGETS);
  const duration = integerInRange(req.body?.duration_minutes ?? 20, "Duração", 1, 30);
  const result = await execute(
    `INSERT INTO trainings
      (author_id, title, description, level, difficulty, duration_minutes, target_count, status, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'rascunho', 1)`,
    [authorId, title, description, level, difficulty, duration, targetCount],
  );
  res.status(201).json({ message: "Treino criado como rascunho.", id: result.insertId, trainingId: result.insertId });
}));

app.get("/trainings", authenticateToken, handle(async (req, res) => {
  const userId = currentUserId(req);
  const user = await getDbUser(userId);
  if (!user) throw httpError(401, "Usuário não encontrado.");
  const where = user.role === "admin" ? "" : user.role === "treinador"
    ? "WHERE t.status = 'publicado' OR t.author_id = ?"
    : "WHERE t.status = 'publicado'";
  const params = user.role === "treinador" ? [userId] : [];
  const trainings = await findRows(
    `SELECT t.* FROM trainings t ${where} ORDER BY COALESCE(t.updated_at, t.created_at) DESC, t.id DESC`,
    params,
  );
  res.json({ message: "Catálogo de treinos recuperado.", total: trainings.length, trainings });
}));

app.get("/trainings/:id", authenticateToken, handle(async (req, res) => {
  const trainingId = positiveId(req.params.id, "Treino");
  const { training } = await requireTrainingView(trainingId, currentUserId(req));
  res.json({ training });
}));

app.put("/trainings/:id", authenticateToken, requireRoles("admin", "treinador"), handle(async (req, res) => {
  const trainingId = positiveId(req.params.id, "Treino");
  const userId = currentUserId(req);
  const { training } = await requireTrainingEditor(trainingId, userId);
  const body = req.body ?? {};
  const patch: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    patch.push(`${column} = ?`);
    values.push(value);
  };
  const fields = ["title", "description", "level", "difficulty", "target_count", "duration_minutes"];
  let contentChanged = false;
  for (const key of fields) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = key === "title"
      ? requiredText(body[key], "Título", 120)
      : key === "description"
        ? optionalText(body[key], "Descrição", 5000) ?? ""
        : key === "level"
          ? validLevel(body[key])
          : key === "difficulty"
            ? integerInRange(body[key], "Dificuldade", 1, 5)
            : key === "target_count"
              ? integerInRange(body[key], "Quantidade de alvos", 1, MAX_TARGETS)
              : integerInRange(body[key], "Duração", 1, 30);
    add(key, value);
    if (String(training[key] ?? "") !== String(value)) contentChanged = true;
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (!isTrainingStatus(body.status)) throw httpError(400, "Status do treino inválido.");
    if (body.status !== training.status) {
      add("status", body.status);
      if (body.status === "publicado") {
        patch.push("version = CASE WHEN published_at IS NULL THEN COALESCE(version, 1) ELSE COALESCE(version, 1) + 1 END", "published_at = NOW()");
      }
    }
  } else if (contentChanged && training.status === "publicado") {
    add("status", "rascunho");
  }
  if (patch.length === 0) throw httpError(400, "Nenhuma alteração válida informada.");
  patch.push("updated_at = NOW()");
  const result = await execute(
    `UPDATE trainings SET ${patch.join(", ")} WHERE id = ? AND status = ?`,
    [...values, trainingId, training.status],
  );
  if (result.affectedRows === 0) throw httpError(409, "O treino foi alterado por outro usuário. Atualize a página.");
  const [updated] = await findRows("SELECT * FROM trainings WHERE id = ?", [trainingId]);
  res.json({ message: "Treino atualizado com sucesso.", training: updated });
}));

app.delete("/trainings/:id", authenticateToken, requireRoles("admin", "treinador"), handle(async (req, res) => {
  const trainingId = positiveId(req.params.id, "Treino");
  await requireTrainingEditor(trainingId, currentUserId(req));
  const linked = await findRows("SELECT id FROM sessions WHERE training_id = ? LIMIT 1", [trainingId]);
  if (linked.length > 0) throw httpError(409, "Há sessões vinculadas a este treino. Ele não pode ser excluído.");
  const assigned = await findRows("SELECT id FROM training_assignments WHERE training_id = ? LIMIT 1", [trainingId]);
  if (assigned.length > 0) throw httpError(409, "Há atribuições vinculadas a este treino. Ele não pode ser excluído.");
  await execute("DELETE FROM trainings WHERE id = ?", [trainingId]);
  res.json({ message: "Treino excluído com sucesso." });
}));

app.get(["/sessions/me", "/minhas-sessoes"], authenticateToken, handle(async (req, res) => {
  const sessions = await findRows(
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC",
    [currentUserId(req)],
  );
  res.json({ sessions });
}));

app.post("/sessions", authenticateToken, handle(async (req, res) => {
  const userId = currentUserId(req);
  const title = requiredText(req.body?.title ?? "Sessão de treino", "Título", 120);
  const difficulty = integerInRange(req.body?.difficulty ?? 2, "Dificuldade", 1, 5);
  const targetCount = integerInRange(req.body?.target_count ?? 6, "Quantidade de alvos", 1, MAX_TARGETS);
  const planned = integerInRange(req.body?.planned_duration_seconds ?? 300, "Duração da sessão", 60, 1800);
  let trainingId = req.body?.training_id == null || req.body.training_id === ""
    ? null : positiveId(req.body.training_id, "Treino");
  let assignmentId = req.body?.assignment_id == null || req.body.assignment_id === ""
    ? null : positiveId(req.body.assignment_id, "Atribuição");

  if (trainingId !== null) {
    await requireTrainingView(trainingId, userId);
  }
  if (assignmentId !== null) {
    const [assignment] = await findRows(
      "SELECT id, training_id, student_id, completed FROM training_assignments WHERE id = ? LIMIT 1",
      [assignmentId],
    );
    if (!assignment || Number(assignment.student_id) !== userId || Number(assignment.completed) === 1) {
      throw httpError(403, "Atribuição inexistente, concluída ou não pertencente ao usuário.");
    }
    if (trainingId !== null && Number(assignment.training_id) !== trainingId) {
      throw httpError(400, "O treino informado não corresponde à atribuição.");
    }
    trainingId = Number(assignment.training_id);
    await requireTrainingView(trainingId, userId);
  } else if (trainingId !== null) {
    const pending = await findRows(
      `SELECT id FROM training_assignments
       WHERE student_id = ? AND training_id = ? AND completed = 0
       ORDER BY created_at DESC LIMIT 2`,
      [userId, trainingId],
    );
    if (pending.length === 1) assignmentId = Number(pending[0].id);
  }

  const result = await execute(
    `INSERT INTO sessions
      (user_id, training_id, assignment_id, title, status, difficulty, target_count,
       planned_duration_seconds, started_at)
     VALUES (?, ?, ?, ?, 'em_andamento', ?, ?, ?, NOW())`,
    [userId, trainingId, assignmentId, title, difficulty, targetCount, planned],
  );
  res.status(201).json({ message: "Sessão criada e iniciada.", sessionId: String(result.insertId) });
}));

const fetchSession: Handler = async (req, res) => {
  const sessionId = positiveId(req.params.id ?? req.params.sessionId, "Sessão");
  const session = await requireSessionOwner(sessionId, currentUserId(req));
  res.json({ session });
};

const fetchSessionHits: Handler = async (req, res) => {
  const sessionId = positiveId(req.params.id ?? req.params.sessionId, "Sessão");
  await requireSessionOwner(sessionId, currentUserId(req));
  const hits = await findRows(
    "SELECT * FROM session_hits WHERE session_id = ? ORDER BY created_at ASC, id ASC",
    [sessionId],
  );
  res.json({ hits });
};

app.get(["/sessoes/:id", "/sessions/:id"], authenticateToken, handle(fetchSession));
app.get(["/sessoes/:id/hits", "/sessions/:id/hits"], authenticateToken, handle(fetchSessionHits));

app.put("/sessoes/:id", authenticateToken, handle(async (req, res) => {
  const sessionId = positiveId(req.params.id, "Sessão");
  const session = await requireSessionOwner(sessionId, currentUserId(req));
  const status = req.body?.status;
  if (status !== "em_andamento" && status !== "cancelada") {
    throw httpError(400, "Esta rota aceita apenas iniciar ou cancelar. Finalize usando /sessions/:id/end.");
  }
  if (status === "em_andamento") {
    if (session.status === "concluida" || session.status === "cancelada") {
      throw httpError(409, "Esta sessão não pode ser reiniciada.");
    }
    await execute(
      `UPDATE sessions SET status = 'em_andamento', started_at = COALESCE(started_at, NOW())
       WHERE id = ? AND user_id = ?`,
      [sessionId, session.user_id],
    );
  } else {
    if (session.status === "concluida") throw httpError(409, "Esta sessão já foi concluída.");
    await execute(
      "UPDATE sessions SET status = 'cancelada', ended_at = NOW() WHERE id = ? AND user_id = ?",
      [sessionId, session.user_id],
    );
    liveStates.delete(String(sessionId));
  }
  res.json({ message: "Sessão atualizada com sucesso." });
}));

async function appendHits(sessionId: number, rawHits: unknown[]) {
  if (rawHits.length === 0 || rawHits.length > 100) {
    throw httpError(400, "Envie entre 1 e 100 rebatidas por requisição.");
  }
  const settings = await scoreSettings();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessionRows] = await connection.query(
      "SELECT id, user_id, target_count, status FROM sessions WHERE id = ? FOR UPDATE",
      [sessionId],
    );
    const session = (sessionRows as DbRow[])[0];
    if (!session) throw httpError(404, "Sessão não encontrada.");
    if (session.status !== "em_andamento") throw httpError(409, "Sessão não está em andamento.");
    const [existingRows] = await connection.query(
      "SELECT hit FROM session_hits WHERE session_id = ? ORDER BY created_at ASC, id ASC",
      [sessionId],
    );
    let streak = 0;
    for (const row of existingRows as DbRow[]) {
      streak = Number(row.hit) === 1 ? streak + 1 : 0;
    }
    let registered = 0;
    let duplicates = 0;
    for (const raw of rawHits) {
      const hit = parseHit(raw, Number(session.target_count));
      if (hit.event_id) {
        const [duplicatesRows] = await connection.query(
          "SELECT id FROM session_hits WHERE session_id = ? AND event_id = ? LIMIT 1",
          [sessionId, hit.event_id],
        );
        if ((duplicatesRows as DbRow[]).length > 0) {
          duplicates += 1;
          continue;
        }
      }
      const score = calculatePoints(hit, streak, settings);
      await connection.query(
        `INSERT INTO session_hits
          (session_id, user_id, target_index, hit, accuracy, reaction_ms, points, bonus_points, event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          session.user_id,
          hit.target_index,
          hit.hit ? 1 : 0,
          hit.accuracy,
          hit.reaction_ms,
          score.points,
          score.bonus,
          hit.event_id,
        ],
      );
      streak = hit.hit ? streak + 1 : 0;
      registered += 1;
    }
    await connection.commit();
    return { registered, duplicates };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

app.post("/sessions/:sessionId/hits", verifyArenaKey, handle(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId, "Sessão");
  const result = await appendHits(sessionId, [req.body]);
  res.status(result.registered ? 201 : 200).json({ message: "Rebatida processada.", ...result });
}));

app.post("/sessoes/:id/hits", verifyArenaKey, handle(async (req, res) => {
  const sessionId = positiveId(req.params.id, "Sessão");
  if (!Array.isArray(req.body?.hits)) throw httpError(400, "Informe o array hits.");
  const result = await appendHits(sessionId, req.body.hits);
  res.status(result.registered ? 201 : 200).json({ message: "Rebatidas processadas.", ...result });
}));

app.put("/sessions/:sessionId/end", authenticateToken, handle(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId, "Sessão");
  const userId = currentUserId(req);
  const actingUser = await getDbUser(userId);
  if (!actingUser) throw httpError(401, "Usuário não encontrado.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessionRows] = await connection.query("SELECT * FROM sessions WHERE id = ? FOR UPDATE", [sessionId]);
    const session = (sessionRows as DbRow[])[0];
    if (!session) throw httpError(404, "Sessão não encontrada.");
    if (actingUser.role !== "admin" && Number(session.user_id) !== userId) {
      throw httpError(403, "Você não pode finalizar esta sessão.");
    }
    if (session.status === "concluida") {
      await connection.commit();
      res.json({ message: "Sessão já concluída.", results: {
        total_points: Number(session.total_points ?? 0),
        accuracy: Number(session.accuracy ?? 0),
        best_streak: Number(session.best_streak ?? 0),
        bonus_points: Number(session.bonus_points ?? 0),
      } });
      return;
    }
    if (session.status !== "em_andamento") throw httpError(409, "Sessão não está em andamento.");
    const [hitsRows] = await connection.query(
      `SELECT hit, points, bonus_points FROM session_hits
       WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
      [sessionId],
    );
    const hits = hitsRows as DbRow[];
    let totalPoints = 0;
    let bonusPoints = 0;
    let totalHits = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    for (const shot of hits) {
      totalPoints += Number(shot.points ?? 0);
      bonusPoints += Number(shot.bonus_points ?? 0);
      if (Number(shot.hit) === 1) {
        totalHits += 1;
        currentStreak += 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    const accuracy = hits.length ? Number(((totalHits / hits.length) * 100).toFixed(2)) : 0;
    await connection.query(
      `UPDATE sessions
       SET status = 'concluida', ended_at = NOW(), total_points = ?, bonus_points = ?,
           accuracy = ?, best_streak = ? WHERE id = ?`,
      [totalPoints, bonusPoints, accuracy, bestStreak, sessionId],
    );
    if (session.assignment_id != null) {
      await connection.query(
        `UPDATE training_assignments SET completed = 1
         WHERE id = ? AND student_id = ? AND completed = 0`,
        [session.assignment_id, session.user_id],
      );
    }
    await connection.commit();
    liveStates.delete(String(sessionId));
    res.json({ message: "Sessão finalizada com sucesso!", results: {
      total_shots: hits.length,
      total_hits: totalHits,
      total_points: totalPoints,
      bonus_points: bonusPoints,
      accuracy,
      best_streak: bestStreak,
    } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/sessions/:id/live", authenticateToken, handle(async (req, res) => {
  const sessionId = positiveId(req.params.id, "Sessão");
  const session = await requireSessionOwner(sessionId, currentUserId(req));
  const state = liveStates.get(String(sessionId));
  const connected = session.status === "em_andamento" && !!state?.connected && Date.now() - state.updated_ms < LIVE_TTL_MS;
  res.json({
    connected,
    active_target_index: connected ? state!.active_target_index : null,
    updated_at: state?.updated_at ?? null,
  });
}));

app.put("/sessions/:id/live", verifyArenaKey, handle(async (req, res) => {
  const sessionId = positiveId(req.params.id, "Sessão");
  const [session] = await findRows("SELECT status, target_count FROM sessions WHERE id = ?", [sessionId]);
  if (!session) throw httpError(404, "Sessão não encontrada.");
  if (session.status !== "em_andamento") throw httpError(409, "Sessão não está em andamento.");
  const connected = req.body?.connected;
  if (connected !== true && connected !== false) throw httpError(400, "Informe connected como booleano.");
  const rawTarget = req.body?.active_target_index;
  const targetIndex = rawTarget === null || rawTarget === undefined
    ? null : integerInRange(rawTarget, "Índice do LED", 0, Math.min(Number(session.target_count), MAX_TARGETS) - 1);
  const updated_ms = Date.now();
  const updated_at = new Date(updated_ms).toISOString();
  liveStates.set(String(sessionId), {
    connected,
    active_target_index: connected ? targetIndex : null,
    updated_at,
    updated_ms,
  });
  res.json({ connected, active_target_index: connected ? targetIndex : null, updated_at });
}));

app.get("/arena/active-session", verifyArenaKey, handle(async (_req, res) => {
  const [session] = await findRows(
    `SELECT id, user_id, training_id, title, difficulty, target_count,
            planned_duration_seconds, started_at, status
     FROM sessions WHERE status = 'em_andamento'
     ORDER BY started_at DESC, id DESC LIMIT 1`,
  );
  res.json({ session: session ?? null });
}));

app.get("/dashboard/me", authenticateToken, handle(async (req, res) => {
  const userId = currentUserId(req);
  const [overview] = await findRows(
    `SELECT COUNT(id) AS total_sessions,
            COALESCE(SUM(total_points), 0) AS all_time_points,
            COALESCE(AVG(accuracy), 0) AS average_accuracy,
            COALESCE(MAX(best_streak), 0) AS highest_streak
     FROM sessions WHERE user_id = ? AND status = 'concluida'`,
    [userId],
  );
  const history = await findRows(
    `SELECT id, title, total_points, accuracy, best_streak, ended_at
     FROM sessions WHERE user_id = ? AND status = 'concluida'
     ORDER BY ended_at DESC, id DESC LIMIT 5`,
    [userId],
  );
  res.json({
    overview: {
      total_sessions: Number(overview.total_sessions ?? 0),
      all_time_points: Number(overview.all_time_points ?? 0),
      average_accuracy: Number(overview.average_accuracy ?? 0),
      highest_streak: Number(overview.highest_streak ?? 0),
    },
    recent_sessions: history,
  });
}));

app.get("/dashboard/me/targets", authenticateToken, handle(async (req, res) => {
  const targets = await findRows(
    `SELECT h.target_index, COUNT(*) AS total_shots,
            COALESCE(SUM(h.hit), 0) AS total_hits,
            COALESCE(100 * SUM(h.hit) / COUNT(*), 0) AS hit_percentage
     FROM session_hits h JOIN sessions s ON s.id = h.session_id
     WHERE s.user_id = ? AND s.status = 'concluida'
     GROUP BY h.target_index ORDER BY h.target_index ASC`,
    [currentUserId(req)],
  );
  res.json({ targets: targets.map((target) => ({
    target_index: Number(target.target_index),
    total_shots: Number(target.total_shots),
    total_hits: Number(target.total_hits),
    hit_percentage: Number(target.hit_percentage),
  })) });
}));

app.get("/leaderboard", authenticateToken, handle(async (_req, res) => {
  const ranking = await findRows(
    `SELECT s.user_id, u.email, COALESCE(SUM(s.total_points), 0) AS total_score,
            COALESCE(AVG(s.accuracy), 0) AS avg_accuracy, COUNT(s.id) AS matches_played
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.status = 'concluida'
     GROUP BY s.user_id, u.email ORDER BY total_score DESC LIMIT 10`,
  );
  res.json({ leaderboard: ranking.map((player, index) => ({
    rank: index + 1,
    player: String(player.email).split("@")[0],
    total_score: Number(player.total_score),
    avg_accuracy: Number(player.avg_accuracy),
    matches_played: Number(player.matches_played),
  })) });
}));

app.get("/treinador/alunos", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const userId = currentUserId(req);
  const user = await getDbUser(userId);
  const where = user?.role === "admin" ? "" : "AND p.coach_id = ?";
  const students = await findRows(
    `SELECT p.id, p.full_name, p.email, p.tennis_level, p.institution, p.coach_id
     FROM profiles p JOIN users u ON u.id = p.id
     WHERE u.role = 'praticante' ${where}
     ORDER BY p.full_name ASC, p.id ASC`,
    user?.role === "admin" ? [] : [userId],
  );
  res.json({ students });
}));

app.get("/treinador/sessoes", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const userId = currentUserId(req);
  const user = await getDbUser(userId);
  const where = user?.role === "admin" ? "" : "WHERE p.coach_id = ?";
  const sessions = await findRows(
    `SELECT s.* FROM sessions s
     JOIN profiles p ON p.id = s.user_id
     JOIN users u ON u.id = s.user_id AND u.role = 'praticante'
     ${where}
     ORDER BY s.created_at DESC, s.id DESC`,
    user?.role === "admin" ? [] : [userId],
  );
  res.json({ sessions });
}));

app.get("/treinador/alunos/:id", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const profile = await requireStudentView(positiveId(req.params.id, "Aluno"), currentUserId(req));
  res.json({ profile });
}));

app.get("/treinador/alunos/:id/sessoes", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const studentId = positiveId(req.params.id, "Aluno");
  await requireStudentView(studentId, currentUserId(req));
  const sessions = await findRows(
    "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC",
    [studentId],
  );
  res.json({ sessions });
}));

app.get("/treinador/alunos/:id/hits", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const studentId = positiveId(req.params.id, "Aluno");
  await requireStudentView(studentId, currentUserId(req));
  const hits = await findRows(
    `SELECT h.* FROM session_hits h JOIN sessions s ON s.id = h.session_id
     WHERE s.user_id = ? ORDER BY s.created_at ASC, h.created_at ASC, h.id ASC`,
    [studentId],
  );
  res.json({ hits });
}));

app.get("/trainings/:id/sessoes", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const trainingId = positiveId(req.params.id, "Treino");
  const userId = currentUserId(req);
  const { user } = await requireTrainingEditor(trainingId, userId);
  const where = user.role === "admin" ? "" : "AND p.coach_id = ?";
  const sessions = await findRows(
    `SELECT s.* FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.training_id = ? ${where}
     ORDER BY s.created_at DESC, s.id DESC`,
    user.role === "admin" ? [trainingId] : [trainingId, userId],
  );
  res.json({ sessions });
}));

app.get("/trainings/:id/hits", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const trainingId = positiveId(req.params.id, "Treino");
  const userId = currentUserId(req);
  const { user } = await requireTrainingEditor(trainingId, userId);
  const where = user.role === "admin" ? "" : "AND p.coach_id = ?";
  const hits = await findRows(
    `SELECT h.* FROM session_hits h
     JOIN sessions s ON s.id = h.session_id
     JOIN profiles p ON p.id = s.user_id
     WHERE s.training_id = ? ${where}
     ORDER BY s.created_at ASC, h.created_at ASC, h.id ASC`,
    user.role === "admin" ? [trainingId] : [trainingId, userId],
  );
  res.json({ hits });
}));

app.post("/treinador/atribuicoes", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const trainerId = currentUserId(req);
  const trainer = await getDbUser(trainerId);
  const assignments = req.body?.assignments;
  if (!Array.isArray(assignments) || assignments.length === 0 || assignments.length > 100) {
    throw httpError(400, "Informe entre 1 e 100 atribuições.");
  }
  const prepared = assignments.map((item: unknown) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw httpError(400, "Atribuição inválida.");
    }
    const row = item as Record<string, unknown>;
    return {
      trainingId: positiveId(row.training_id, "Treino"),
      studentId: positiveId(row.student_id, "Aluno"),
      dueDate: optionalDate(row.due_date),
      note: optionalText(row.note, "Orientação", 1000),
    };
  });
  const uniquePairs = new Set(prepared.map((item) => `${item.trainingId}:${item.studentId}`));
  if (uniquePairs.size !== prepared.length) throw httpError(400, "Há atribuições duplicadas no envio.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const item of prepared) {
      const [trainingRows] = await connection.query(
        "SELECT id, author_id, status FROM trainings WHERE id = ? LIMIT 1",
        [item.trainingId],
      );
      const training = (trainingRows as DbRow[])[0];
      if (!training || training.status !== "publicado") {
        throw httpError(400, "Somente treinos publicados podem ser enviados.");
      }
      const [studentRows] = await connection.query(
        `SELECT p.id, p.coach_id, u.role FROM profiles p
         JOIN users u ON u.id = p.id WHERE p.id = ? LIMIT 1 FOR UPDATE`,
        [item.studentId],
      );
      const student = (studentRows as DbRow[])[0];
      if (!student || student.role !== "praticante") throw httpError(404, "Aluno não encontrado.");
      if (trainer?.role !== "admin" && Number(student.coach_id) !== trainerId) {
        throw httpError(403, "O aluno selecionado não está vinculado ao treinador.");
      }
      const [pendingRows] = await connection.query(
        `SELECT id FROM training_assignments
         WHERE training_id = ? AND student_id = ? AND completed = 0 LIMIT 1`,
        [item.trainingId, item.studentId],
      );
      if ((pendingRows as DbRow[]).length > 0) {
        throw httpError(409, "Um dos alunos já possui uma atribuição pendente deste treino.");
      }
      await connection.query(
        `INSERT INTO training_assignments
          (training_id, student_id, assigned_by, due_date, note, completed)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [item.trainingId, item.studentId, trainerId, item.dueDate, item.note],
      );
    }
    await connection.commit();
    res.status(201).json({ message: "Treinos enviados com sucesso.", total: prepared.length });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get("/treinador/atribuicoes/recentes", authenticateToken, requireRoles("treinador", "admin"), handle(async (req, res) => {
  const userId = currentUserId(req);
  const user = await getDbUser(userId);
  const where = user?.role === "admin" ? "" : "WHERE a.assigned_by = ?";
  const assignments = await findRows(
    `SELECT a.*, t.title AS training_title, p.full_name AS student_name
     FROM training_assignments a
     JOIN trainings t ON t.id = a.training_id
     JOIN profiles p ON p.id = a.student_id
     ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT 20`,
    user?.role === "admin" ? [] : [userId],
  );
  res.json({ assignments });
}));

app.get("/minhas-atribuicoes", authenticateToken, handle(async (req, res) => {
  const assignments = await findRows(
    `SELECT a.*, t.id AS training_detail_id, t.title AS training_title,
            t.level AS training_level, t.description AS training_description
     FROM training_assignments a JOIN trainings t ON t.id = a.training_id
     WHERE a.student_id = ? ORDER BY a.created_at DESC, a.id DESC`,
    [currentUserId(req)],
  );
  res.json({ assignments: assignments.map((row) => ({
    id: row.id,
    training_id: row.training_id,
    student_id: row.student_id,
    assigned_by: row.assigned_by,
    due_date: row.due_date,
    note: row.note,
    completed: row.completed,
    created_at: row.created_at,
    trainings: {
      id: row.training_detail_id,
      title: row.training_title,
      level: row.training_level,
      description: row.training_description,
    },
  })) });
}));

app.get("/admin/profiles", authenticateToken, requireRoles("admin"), handle(async (_req, res) => {
  const profiles = await findRows(
    `SELECT p.id, p.full_name, p.email, p.tennis_level, p.institution, p.coach_id,
            p.created_at, u.role
     FROM profiles p JOIN users u ON u.id = p.id ORDER BY p.created_at DESC`,
  );
  res.json({ profiles });
}));

app.get("/admin/usuarios", authenticateToken, requireRoles("admin"), handle(async (_req, res) => {
  const profiles = await findRows(
    `SELECT u.id, p.full_name, u.email, u.role, p.tennis_level,
            p.institution, p.coach_id, p.created_at
     FROM users u LEFT JOIN profiles p ON p.id = u.id ORDER BY u.id DESC`,
  );
  res.json({ profiles });
}));

app.get("/admin/usuarios/roles", authenticateToken, requireRoles("admin"), handle(async (_req, res) => {
  const roles = await findRows("SELECT id AS user_id, role FROM users ORDER BY id DESC");
  res.json({ roles });
}));

app.put("/admin/usuarios/:userId/role", authenticateToken, requireRoles("admin"), handle(async (req, res) => {
  const targetId = positiveId(req.params.userId, "Usuário");
  const role = req.body?.role;
  if (!roleValue(role)) throw httpError(400, "Perfil de acesso inválido.");
  const adminId = currentUserId(req);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT id, role FROM users WHERE id = ? FOR UPDATE", [targetId]);
    const user = (rows as DbRow[])[0];
    if (!user) throw httpError(404, "Usuário não encontrado.");
    if (user.role === "admin" && role !== "admin") {
      if (targetId === adminId) throw httpError(409, "Você não pode remover sua própria permissão administrativa.");
      const [counts] = await connection.query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
      if (Number((counts as DbRow[])[0].total) <= 1) {
        throw httpError(409, "Não é possível remover o último administrador.");
      }
    }
    await connection.query("UPDATE users SET role = ? WHERE id = ?", [role, targetId]);
    await connection.commit();
    res.json({ message: "Permissão atualizada.", userId: targetId, role });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.put("/admin/usuarios/:userId/coach", authenticateToken, requireRoles("admin"), handle(async (req, res) => {
  const studentId = positiveId(req.params.userId, "Aluno");
  const coachId = req.body?.coach_id == null ? null : positiveId(req.body.coach_id, "Treinador");
  const [student] = await findRows("SELECT id, role FROM users WHERE id = ?", [studentId]);
  if (!student || student.role !== "praticante") throw httpError(400, "Selecione um usuário praticante.");
  if (coachId !== null) {
    const [coach] = await findRows("SELECT id, role FROM users WHERE id = ?", [coachId]);
    if (!coach || coach.role !== "treinador") throw httpError(400, "O responsável deve ter perfil de treinador.");
  }
  await execute("UPDATE profiles SET coach_id = ? WHERE id = ?", [coachId, studentId]);
  res.json({ message: "Vínculo entre aluno e treinador atualizado.", studentId, coach_id: coachId });
}));

app.get("/admin/sessions", authenticateToken, requireRoles("admin"), handle(async (_req, res) => {
  const sessions = await findRows(
    `SELECT id, user_id, title, accuracy, status, created_at, ended_at,
            total_points, best_streak FROM sessions ORDER BY created_at DESC, id DESC`,
  );
  res.json({ sessions });
}));

app.get("/admin/trainings", authenticateToken, requireRoles("admin"), handle(async (_req, res) => {
  const trainings = await findRows(
    `SELECT id, title, status, COALESCE(updated_at, created_at) AS updated_at, version
     FROM trainings ORDER BY updated_at DESC, id DESC LIMIT 8`,
  );
  res.json({ trainings });
}));

app.get("/admin/settings", authenticateToken, requireRoles("admin"), handle(async (_req, res) => {
  const settings = await findRows(
    "SELECT `key`, `value`, description, updated_at FROM system_settings ORDER BY `key` ASC",
  );
  res.json({ settings });
}));

app.put("/admin/settings/:key", authenticateToken, requireRoles("admin"), handle(async (req, res) => {
  const key = requiredText(req.params.key, "Chave do parâmetro", 100);
  const value = req.body?.value;
  if (typeof value !== "string" || value.length > 2000) {
    throw httpError(400, "O valor do parâmetro deve ser um texto de até 2000 caracteres.");
  }
  const [existing] = await findRows("SELECT `key` FROM system_settings WHERE `key` = ?", [key]);
  if (!existing) throw httpError(404, "Parâmetro não encontrado.");
  const numericSettings: (keyof ScoreSettings)[] = [
    "base_hit_points", "streak_bonus_step", "streak_bonus_cap",
    "speed_fast_ms", "speed_medium_ms", "speed_fast_bonus", "speed_medium_bonus",
  ];
  if (numericSettings.includes(key as keyof ScoreSettings)) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > 100000) {
      throw httpError(400, "Este parâmetro deve ser um número inteiro não negativo.");
    }
  }
  await execute("UPDATE system_settings SET `value` = ?, updated_at = NOW() WHERE `key` = ?", [value, key]);
  res.json({ message: "Parâmetro atualizado com sucesso.", key, value });
}));

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const issue = error as { status?: number; code?: string; message?: string };
  if (issue.code === "ER_DUP_ENTRY") {
    res.status(409).json({ error: "Este registro já existe." });
    return;
  }
  if (issue.code === "ER_NO_REFERENCED_ROW_2" || issue.code === "ER_ROW_IS_REFERENCED_2") {
    res.status(409).json({ error: "O registro possui vínculos que impedem esta operação." });
    return;
  }
  const status = typeof issue.status === "number" && issue.status >= 400 && issue.status < 500
    ? issue.status : 500;
  if (status >= 500) console.error("Erro interno na API:", error);
  res.status(status).json({ error: status === 500 ? "Erro interno no servidor." : issue.message ?? "Requisição inválida." });
};

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API Smart Tennis Arena disponível na porta ${PORT}`);
});
