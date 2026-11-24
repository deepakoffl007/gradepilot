# GradePilot — semester-wise academic planner

A responsive student dashboard built with Vite, vanilla JavaScript and Supabase.

## Features
- Email/password registration, login and logout via Supabase Auth.
- Username saved in a profile table (passwords are never stored by GradePilot).
- Semester-wise subject management.
- Add, edit and delete subjects.
- Internal marks out of 60 and target grade selection.
- Required semester-exam score out of 75 (exam component is converted to 40).
- Per-user data isolation enforced by PostgreSQL Row Level Security (RLS).

## 1. Create your Supabase project
1. Create a project at https://supabase.com.
2. Open **Project Settings → API** (or API Keys).
3. Copy the Project URL and the publishable/anon key.
4. In Authentication settings, configure your site URL and allowed redirect URLs for local development and your deployed domain.

## 2. Configure environment
Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Only the public anon/publishable key belongs in a browser app. **Never put the service-role key in frontend code.**

## 3. Create database tables and security policies
In Supabase Dashboard → SQL Editor, run the complete contents of `supabase/schema.sql`.

The SQL creates profiles, semesters and subjects, adds ownership constraints and enables RLS. Each signed-in user can only read or modify their own records.

## 4. Run locally
Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## 5. Deploy
Deploy the project to Vercel or Netlify. Add the same two environment variables in the hosting provider's project settings, then redeploy. Add the deployed domain to Supabase Auth's allowed redirect URLs.

## Grade calculation
Grade boundaries used (from the supplied grading scale):
- O: 91–100
- A+: 81–90
- A: 71–80
- B+: 61–70
- B: 56–60
- C: 50–55

Overall = internal marks + (semester exam marks × 40 / 75).

The required exam score is rounded up to the next whole mark. Confirm these boundaries with your institution before relying on the result.
