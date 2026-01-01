# Typix.app Onboarding Implementation Plan

## Overview
3-step onboarding flow with Amy-style UI (soft gradients, cat mascot, card selections).

---

## 1. Database Schema (Drizzle)

Create `db/schema/onboarding.ts`:

```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth"; // Better Auth user table

export const userOnboarding = pgTable("user_onboarding", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }).unique().notNull(),

  // Step 1: Use Case
  primaryUseCase: varchar("primary_use_case", { length: 50 }).notNull(),
  primaryUseCaseOther: text("primary_use_case_other"),

  // Step 2: Processing Preference
  processingPreference: varchar("processing_preference", { length: 50 }).notNull(),

  // Step 3: Preferences (optional)
  defaultTone: varchar("default_tone", { length: 20 }),
  notifyLocalRelease: boolean("notify_local_release").default(false),

  // Metadata
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow(),
  skippedStep3: boolean("skipped_step_3").default(false),
});
```

**Run migrations:**
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## 2. API Endpoints

### POST `/api/onboarding`
Submit onboarding data (requires auth).

```typescript
// app/api/onboarding/route.ts (Next.js) or equivalent
import { db } from "@/db";
import { userOnboarding } from "@/db/schema/onboarding";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  await db.insert(userOnboarding).values({
    userId: session.user.id,
    primaryUseCase: body.primaryUseCase,
    primaryUseCaseOther: body.primaryUseCaseOther,
    processingPreference: body.processingPreference,
    defaultTone: body.defaultTone,
    notifyLocalRelease: body.notifyLocalRelease,
    skippedStep3: body.skippedStep3,
  }).onConflictDoUpdate({
    target: userOnboarding.userId,
    set: {
      primaryUseCase: body.primaryUseCase,
      primaryUseCaseOther: body.primaryUseCaseOther,
      processingPreference: body.processingPreference,
      defaultTone: body.defaultTone,
      notifyLocalRelease: body.notifyLocalRelease,
      skippedStep3: body.skippedStep3,
      completedAt: new Date(),
    },
  });

  return Response.json({ success: true });
}
```

### GET `/api/onboarding/status`
Check if user completed onboarding.

```typescript
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return Response.json({ completed: false });
  }

  const result = await db.query.userOnboarding.findFirst({
    where: eq(userOnboarding.userId, session.user.id),
  });

  return Response.json({
    completed: !!result,
    completedAt: result?.completedAt,
  });
}
```

---

## 3. Onboarding Page

Create `/onboarding` page with 3 steps.

### File Structure
```
app/
  onboarding/
    page.tsx              # Main onboarding page
    layout.tsx            # Minimal layout (no navbar)
components/
  onboarding/
    OnboardingLayout.tsx  # Shared layout with progress
    ProgressDots.tsx      # Progress indicator
    StepUseCase.tsx       # Step 1
    StepProcessing.tsx    # Step 2
    StepPreferences.tsx   # Step 3
    OptionCard.tsx        # Selectable card component
```

---

## 4. Onboarding Steps Content

### Step 1: Use Case (Required)
**Question:** "What will you use Typix for?"

| Value | Label | Description | Icon |
|-------|-------|-------------|------|
| `professional` | Work & Business | Emails, reports, documents | 💼 |
| `academic` | Academic | Essays, research, papers | 📚 |
| `social` | Social Media | Posts, comments, messages | 💬 |
| `creative` | Creative Writing | Blogs, stories, content | ✍️ |
| `other` | Other | (shows text input) | ✨ |

### Step 2: Processing Preference (Required)
**Question:** "How would you like Typix to process your text?"
**Subtitle:** "We're working on local processing for enhanced privacy."

| Value | Label | Description | Icon |
|-------|-------|-------------|------|
| `cloud_only` | Cloud is fine | Fast, always up-to-date | ☁️ |
| `local_preferred` | Prefer local | Would switch when available | 🏠 |
| `local_required` | Need local | Privacy is critical for me | 🔒 |
| `no_preference` | No preference | Either works for me | 🤷 |

### Step 3: Preferences (Skippable)
**Question:** "Set your defaults"
**Subtitle:** "You can change these anytime."

- **Default tone:** formal / casual / friendly / academic (radio/cards)
- **Notify me:** Checkbox "Let me know when local processing launches"
- **Skip link:** "Skip for now"

---

## 5. UI Components

### ProgressDots
```tsx
interface ProgressDotsProps {
  currentStep: number;
  totalSteps: number;
}
```
- Filled dot = completed
- Outlined/active dot = current
- Light dot = upcoming

### OptionCard
```tsx
interface OptionCardProps {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}
```
- Rounded corners (rounded-xl)
- Border changes to purple when selected
- Checkmark appears when selected
- Subtle hover effect

### OnboardingLayout
- Soft cream gradient background
- Centered content (max-w-md)
- Cat mascot image at top
- Progress dots
- Back button (steps 2-3)

---

## 6. Styling (Tailwind)

```css
/* Cream gradient background */
.onboarding-bg {
  @apply bg-gradient-to-b from-amber-50/50 to-white min-h-screen;
}

/* Option card */
.option-card {
  @apply p-4 rounded-xl border-2 border-gray-200
         hover:border-gray-300 cursor-pointer transition-all;
}
.option-card.selected {
  @apply border-violet-500 bg-violet-50/50;
}

/* Primary button */
.btn-primary {
  @apply bg-violet-600 hover:bg-violet-700 text-white
         py-3 px-8 rounded-full font-medium transition-colors;
}
```

---

## 7. State Management

Use React state or Zustand for multi-step form:

```typescript
interface OnboardingState {
  step: 1 | 2 | 3;
  data: {
    primaryUseCase: string;
    primaryUseCaseOther?: string;
    processingPreference: string;
    defaultTone?: string;
    notifyLocalRelease: boolean;
  };
}
```

---

## 8. Flow Logic

```
/onboarding loads
      ↓
Check if user is authenticated
      ↓
  No → Redirect to /login?redirect=/onboarding
      ↓
  Yes → Check if already completed
      ↓
  Completed → Redirect to success/dashboard
      ↓
  Not completed → Show Step 1
      ↓
Complete all steps → POST /api/onboarding
      ↓
Show success → Close tab or redirect
```

---

## 9. Cat Mascot Images

Need 3 poses for each step:
1. **Step 1 (Welcome):** Cat stretching/playful
2. **Step 2 (Processing):** Cat thinking/grooming
3. **Step 3 (Preferences):** Cat relaxed/sleeping

Place in: `public/onboarding/cat-step-1.png`, etc.

---

## 10. Implementation Order

1. [ ] Database schema + migration
2. [ ] API endpoints (`/api/onboarding`, `/api/onboarding/status`)
3. [ ] OptionCard component
4. [ ] ProgressDots component
5. [ ] OnboardingLayout component
6. [ ] Step 1 (StepUseCase)
7. [ ] Step 2 (StepProcessing)
8. [ ] Step 3 (StepPreferences)
9. [ ] Main page with step navigation
10. [ ] Auth redirect logic
11. [ ] Success state / redirect
12. [ ] Add cat mascot images

---

## 11. Better Auth Integration

Add extension to trusted origins in auth config:

```typescript
// lib/auth.ts
export const auth = betterAuth({
  // ... existing config
  trustedOrigins: [
    "chrome-extension://YOUR_EXTENSION_ID",
  ],
});
```

Get extension ID from `chrome://extensions` after loading unpacked.
