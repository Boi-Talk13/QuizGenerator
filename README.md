# QuizGenerator

Turn any topic into a 10-question multiple-choice quiz in seconds. Pick a difficulty, answer the questions, then see your score with a full review and explanations. Create an account to save your scores and track your progress.

A full-stack serverless project: a React + TypeScript frontend, a serverless AWS backend (API Gateway, Lambda, DynamoDB) defined with AWS CDK, and quiz questions written by Llama 3.3 70B through the Groq API.

## Features

- Generate 10 multiple-choice questions on any topic
- Easy, Medium or Hard difficulty
- A hint for every question, and a full review with explanations at the end
- No repeats: questions from earlier quizzes are sent back to the AI so it does not ask them again (with a Reset button)
- Sign up and log in with email and password; the login is remembered in the browser after a refresh
- Profile page: quizzes taken, average score, best score and your last 10 quizzes
- Guest mode: play without an account
- A question grid to jump between questions; Submit unlocks when every question is answered

## How it works

```
React app --HTTPS--> API Gateway (REST) --> one Lambda function (Node.js 20) --> DynamoDB
                                                      |                         (QuizScores, QuizUsers)
                                                      +--> Groq API (llama-3.3-70b-versatile)
```

1. The React app sends the topic and difficulty to `POST /quiz`.
2. The Lambda asks the Groq API for exactly 10 questions and returns them as JSON (question, 4 options, correct answer, explanation, hint).
3. After the quiz, the app saves the score with `POST /score`; the profile page reads it back with `GET /score`.
4. Accounts are stored in the `QuizUsers` table through `/auth/register` and `/auth/login`.

## API (5 endpoints)

| Method | Path | What it does | Request body / query |
|---|---|---|---|
| POST | `/quiz` | Generate 10 questions | `topic`, `difficulty` (`easy`, `medium`, `hard`), `usedQuestions[]` |
| POST | `/score` | Save a quiz score | `userId`, `topic`, `score`, `total` |
| GET | `/score?userId=` | Last 10 scores, newest first | `userId` |
| POST | `/auth/register` | Create an account | `email`, `password`, `name` |
| POST | `/auth/login` | Log in | `email`, `password` |

All five routes are handled by the same Lambda function (`backend/lambda/generateNotes.ts`).

## AWS resources (created by CDK)

- **DynamoDB** `QuizScores` (partition key `userId`, sort key `timestamp`) and `QuizUsers` (partition key `email`), on-demand billing
- **Lambda** `GenerateQuizFunction` (Node.js 20, 30 second timeout)
- **API Gateway** REST API `QuizGeneratorAPI` with CORS enabled
- Region: `ap-south-2` (Hyderabad), set in `backend/bin/backend.ts` and in `backend/lambda/generateNotes.ts`

## Tech stack

- Frontend: React 19, TypeScript, Vite
- Backend: Node.js 20 on AWS Lambda, TypeScript, AWS SDK v3
- Infrastructure as code: AWS CDK (TypeScript)
- AI: Groq API with `llama-3.3-70b-versatile`

## Project structure

```
QuizGenerator/
├── backend/
│   ├── bin/backend.ts            # CDK app entry point
│   ├── lib/backend-stack.ts      # DynamoDB tables, Lambda, API Gateway
│   └── lambda/generateNotes.ts   # Lambda handler: all 5 routes + the Groq call
└── frontend/
    └── src/App.tsx               # The UI: home, quiz, results, login, profile
```

## Getting started

You need Node.js 20+, an AWS account with the AWS CLI configured, and a [Groq API key](https://console.groq.com).

### 1. Deploy the backend

```bash
cd backend
npm install
cd lambda && npm install && cd ..
npm run build                      # compiles the TypeScript (CDK code and the Lambda)
export GROQ_API_KEY=your_groq_api_key
npx cdk bootstrap                  # first time only, per account and region
npx cdk deploy
```

When it finishes, `cdk deploy` prints the `ApiUrl`.

### 2. Run the frontend

```bash
cd frontend
npm install
```

Open `src/App.tsx` and set `API_URL` to the `ApiUrl` printed above (without the trailing slash). Then start the app:

```bash
npm run dev
```

## Known limitations and next steps

This is a learning project, so a few parts are kept simple:

- Authentication is demo-level: passwords are stored as plain text and the score endpoints trust the `userId` sent by the browser. Next step: Amazon Cognito (or hashed passwords with signed tokens).
- `POST /quiz` has no rate limit, so it should sit behind authentication or throttling to protect the Groq quota.
- If the AI returns invalid JSON, the Lambda does not retry or repair it.
- The difficulty level is sent with the score but is not saved yet.
- The frontend is not hosted by the CDK stack; S3 + CloudFront would be the natural addition.
- Automated tests still need to be written.

## Author

Built by Bhavesh Kumar Reddy Vundela.
