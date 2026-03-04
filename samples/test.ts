// ────────────────────────────────────────────────────────────────
// Rosetta Lens フェーズ2 動作確認用サンプルファイル
//
// このファイルをVS Codeで開き、コマンドパレットから
// 「Rosetta Lens: Toggle」を実行すると翻訳オーバーレイが表示される。
//
// 確認ポイント:
//   - 短い識別子（save, load）のズレ確認
//   - 中程度の識別子（fetchUser, handleError）のズレ確認
//   - 長い識別子（getUserById, processPayment）のズレ確認
// ────────────────────────────────────────────────────────────────

// ── 短い識別子（英3〜6字） ──────────────────────────────────────
function save(path: string): void {
  console.log('saving to', path);
}

function load(path: string): string {
  return path;
}

const isActive = true;

function saveData(data: unknown): void {
  console.log('data saved:', data);
}

function loadConfig(file: string): Record<string, unknown> {
  return { file };
}

// ── 中程度の識別子（英7〜10字） ────────────────────────────────
async function fetchUser(id: string): Promise<{ id: string; name: string }> {
  return { id, name: 'Test User' };
}

function handleError(error: Error): void {
  console.error('Error:', error.message);
}

function createSession(userId: string): string {
  return `session_${userId}`;
}

function validateToken(token: string): boolean {
  return token.length > 0;
}

function sendNotification(message: string): void {
  console.log('Notification:', message);
}

// ── 長い識別子（英11字以上） ────────────────────────────────────
async function getUserById(id: string): Promise<{ id: string } | null> {
  if (!id) return null;
  return { id };
}

async function updateProfile(userId: string, data: Record<string, unknown>): Promise<void> {
  console.log('Updating profile for', userId, data);
}

async function deleteAccount(userId: string): Promise<boolean> {
  console.log('Deleting account', userId);
  return true;
}

async function processPayment(amount: number, currency: string): Promise<boolean> {
  console.log('Processing payment:', amount, currency);
  return true;
}

function generateAccessToken(userId: string, scope: string[]): string {
  return `${userId}.${scope.join('.')}`;
}

// ── 実際に近い使用例 ────────────────────────────────────────────
async function main(): Promise<void> {
  // 設定を読み込み、ユーザーを取得してセッションを作成
  const config = loadConfig('./config.json');
  console.log('Config loaded:', config);

  const user = await fetchUser('user-123');
  if (!user) {
    handleError(new Error('User not found'));
    return;
  }

  if (!isActive) {
    sendNotification('Account is inactive');
    return;
  }

  const token = validateToken('my-token') ? generateAccessToken(user.id, ['read', 'write']) : '';
  const session = createSession(user.id);
  console.log('Session:', session, 'Token:', token);

  await updateProfile(user.id, { lastLogin: Date.now() });
  await processPayment(1000, 'JPY');
  saveData({ userId: user.id, timestamp: Date.now() });
  save('./output.json');
}

main().catch(console.error);
