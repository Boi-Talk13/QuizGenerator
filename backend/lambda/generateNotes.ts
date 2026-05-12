import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const client = new DynamoDBClient({ region: 'ap-south-2' });
const docClient = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || 'QuizScores';
const USERS_TABLE = process.env.USERS_TABLE || 'QuizUsers';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
};

interface MCQ {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  hint: string;
}
async function generateQuiz(topic: string, difficulty: string, usedQuestions: string[]): Promise<MCQ[]> {
  const difficultyGuide =
    difficulty === 'easy'
      ? 'Questions should be simple, basic facts suitable for beginners. Avoid tricky wording.'
      : difficulty === 'hard'
      ? 'Questions should be very challenging, requiring deep knowledge, analysis, or specific details. Include tricky options.'
      : 'Questions should be moderate difficulty, requiring good understanding but not expert-level knowledge.'

  const avoidSection = usedQuestions.length > 0
    ? `\n\nIMPORTANT: Do NOT repeat or closely resemble any of these already-used questions:\n${usedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''

  const prompt = `Generate exactly 10 multiple choice questions about "${topic}" at ${difficulty.toUpperCase()} difficulty level.

Difficulty guide: ${difficultyGuide}${avoidSection}

Return ONLY a valid JSON array with no extra text. Each object must have:
- "question": string
- "options": array of exactly 4 strings (A, B, C, D)
- "correct": number (0-3, index of correct option)
- "explanation": string (brief explanation of correct answer)
- "hint": string (a small clue that helps narrow the answer without giving it away, max 1 sentence)

Example format:
[{"question":"What is...?","options":["A","B","C","D"],"correct":0,"explanation":"Because...","hint":"Think about..."}]`;


  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices[0]?.message?.content || '[]';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const questions: MCQ[] = JSON.parse(cleaned);
  return questions;
}

// ── USER FUNCTIONS ─────────────────────────────────────────────────────────

async function registerUser(email: string, password: string, name: string) {
  // Check if user already exists
  const existing = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { email },
  }));
  if (existing.Item) {
    throw new Error('EMAIL_EXISTS');
  }
  await docClient.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      email,
      password, // In production use bcrypt — fine for demo
      name,
      createdAt: new Date().toISOString(),
    },
  }));
  return { email, name };
}

async function loginUser(email: string, password: string) {
  const result = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { email },
  }));
  if (!result.Item) throw new Error('USER_NOT_FOUND');
  if (result.Item.password !== password) throw new Error('WRONG_PASSWORD');
  return { email, name: result.Item.name as string };
}

// ── SCORE FUNCTIONS ────────────────────────────────────────────────────────

async function saveScore(userId: string, topic: string, score: number, total: number) {
  const timestamp = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: SCORES_TABLE,
    Item: {
      userId,
      timestamp,
      topic,
      score,
      total,
      percentage: Math.round((score / total) * 100),
    },
  }));
}

async function getScores(userId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: SCORES_TABLE,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
    Limit: 10,
  }));
  return result.Items || [];
}

// ── HANDLER ────────────────────────────────────────────────────────────────

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const path = event.resource || event.path;
  const method = event.httpMethod;

  try {

    // POST /auth/register
    if (path.includes('/auth/register') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { email, password, name } = body;
      if (!email || !password || !name) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'email, password, name required' }) };
      }
      try {
        const user = await registerUser(email, password, name);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ user }) };
      } catch (e) {
        if (String(e).includes('EMAIL_EXISTS')) {
          return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'Email already registered.' }) };
        }
        throw e;
      }
    }

    // POST /auth/login
    if (path.includes('/auth/login') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { email, password } = body;
      if (!email || !password) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'email and password required' }) };
      }
      try {
        const user = await loginUser(email, password);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ user }) };
      } catch (e) {
        if (String(e).includes('USER_NOT_FOUND') || String(e).includes('WRONG_PASSWORD')) {
          return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid email or password.' }) };
        }
        throw e;
      }
    }

    // POST /quiz
    if (path.includes('/quiz') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { topic } = body;
      if (!topic || typeof topic !== 'string') {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'topic is required' }) };
      }
      const difficulty = body.difficulty || 'medium'
      const usedQuestions = body.usedQuestions || []
      const questions = await generateQuiz(topic.trim(), difficulty, usedQuestions)
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ topic, questions }) };
    }

    // POST /score
    if (path.includes('/score') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { userId, topic, score, total } = body;
      if (!userId || !topic || score === undefined || !total) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'userId, topic, score, total required' }) };
      }
      await saveScore(userId, topic, score, total);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Score saved' }) };
    }

    // GET /score
    if (path.includes('/score') && method === 'GET') {
      const userId = event.queryStringParameters?.userId || 'anonymous';
      const scores = await getScores(userId);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ scores }) };
    }

    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Route not found' }) };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error', details: String(error) }) };
  }
};