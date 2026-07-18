# AutoCVApply demo script

Rough guide for live demos. Aim for **10-12 minutes** on the ATS track; add **5 minutes** if you show LinkedIn Auto Apply.

**How you'd explain it to a mate:** You upload your CV, we pull out the useful bits into a profile, and the browser extension fills job forms from that. Less copy-paste, more actually picking which roles are worth your time.

---

## Before you go live

### Account and profile (day before is fine)

- [ ] Log in at [autocvapply.com](https://autocvapply.com) with an account you can actually get back into.
- [ ] Upload a proper CV (PDF or Word) and let parsing finish.
- [ ] Fill in **Dashboard → Preferences** - notice period, salary, visa stuff, relocation. The extension leans on these for screening questions.
- [ ] Stick 2-3 answers in **Application Q&A** for things that come up every time ("Why this role?", notice period, salary).
- [ ] Glance at **Usage** and make sure you have headroom. A full ATS demo might burn 30-50 credits; LinkedIn fit scoring is **5 per job**.
- [ ] **Dashboard → Extension**: download the zip, hit **Generate & copy connection**, and stash the JSON somewhere - you only get one look.

### Extension (half an hour before)

- [ ] Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/autocvapply/mldeodhhcbnhnjklmelneecjpjkjemih) or [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/autocvapply/), or sideload the dashboard zip via `chrome://extensions` → Load unpacked.
- [ ] Open the **side panel** and pin it if you can.
- [ ] Connect via **Sign in with AutoCVApply** or paste the JSON and **Connect with JSON**.
- [ ] Check you see your name, the green dot, and credits in the header.

### Tabs worth having ready

1. Landing page
2. Dashboard (profile or experience)
3. A real **Greenhouse** or **Ashby** apply page - the form itself, not just the job ad
4. LinkedIn jobs with Easy Apply, if you're doing that bit

### What usually works vs what bites you

| Usually fine | I'd skip on a first demo |
|--------------|--------------------------|
| Greenhouse, Ashby | Workday wizards that go on forever |
| Single-page apply forms | Apply flows behind awkward logins |
| LinkedIn Easy Apply (if you've tested it) | Jobs where you have to leave LinkedIn to apply |

### Local / screenshots only

```bash
php artisan readme:seed-demo
# Then /__readme/demo-login (local env only)
```

Gives you Jane Doe with a filled-out profile if you're not demoing against production.

---

## Track A: ATS demo (~10 min)

Good when you need it to actually work - investors, early users, anyone sceptical of "AI demos".

### 1. Set the scene (1 min) - Landing page

**Show:** [autocvapply.com](https://autocvapply.com)

**Say something like:**

> OK so the annoying bit of job hunting isn't finding roles - it's filling in the same form fifteen times with slightly different field names. Every company runs a different ATS and none of them talk to each other.

**Click:** the **Try Draft All** widget further down the page.

**Say something like:**

> This is a fake form on the homepage, but it shows the idea - one button and the boring fields get filled. What I'm going to show you in a minute is the same thing on a real company's application page, in Chrome.

---

### 2. The profile (1.5 min) - Dashboard

**Show:** **CV profile** and **Experience**

**Say something like:**

> You drop in your CV once. We read it - OCR if it's a scan, proper parsing if it's a doc - and turn it into something editable. You're not locked in; if we got a date wrong or missed a bullet, you fix it here.

**Worth pointing at:**

- Name, contact, summary on **CV profile**
- Roles and bullets on **Experience**
- **Preferences** - what you're actually looking for
- **Application Q&A** - answers you don't want to retype every time

**Say something like:**

> The extension doesn't make stuff up from thin air. When it drafts an answer, it's working from this profile. So if your salary expectation is wrong here, it'll be wrong on the form too - which is why we show you everything before you submit.

---

### 3. Extension hook-up (1 min) - Dashboard → Extension

**Show:** Extension tab (skip the install walkthrough if you're already connected).

**Say something like:**

> Chrome users can grab it from the Chrome Web Store - one click Add to Chrome. Firefox: install from Firefox Add-ons. Edge or Brave: use the store listing or download the zip from the dashboard and sideload. Connect once with sign-in or a token, and you're done. Day to day you just live in this side panel.

**If already connected:** pop the side panel open, flash the green status and credit bar, move on.

---

### 4. Draft All on a real form (4 min) - the main event

**Show:** Greenhouse or Ashby apply page, side panel **open**

**Say something like:**

> Trick I learned the hard way: open the side panel before you expect magic. If the extension sees you're here and the page has form fields, you get a red **Draft All** button down in the bottom-left corner.

**Do:**

1. Side panel open (Assist tab is fine).
2. Hit **Draft All**.
3. Let it run - **"Filling from profile…"** then **"Fill complete."**
4. Scroll the form so people can see name, email, experience, the longer text answers.
5. Flip to **Assist** if you want to show the chat view of what got drafted.

**Say something like:**

> It fills field by field and types like a person, not paste-everything-at-once. Important distinction: on sites like this we stop at filling. You still hit Submit. I actually want to see what's going out under my name.

**If something's blank:** **We need your help** → answer it → **Save & fill**.

---

### 5. ATS score (1.5 min) - Extension ATS tab

**Show:** **ATS** tab

**Do:**

1. Grab the job description from the listing (needs to be more than a line or two).
2. Paste into **Job description**; title and company if you have them.
3. **Run ATS score**.

**Say something like:**

> Sometimes you read a job title, think "perfect", open the spec, and realise it's nothing like your background. This gives you a quick read on fit before you spend half an hour on the application. Costs a few credits.

**Optional:** **Copy output** and skim the matched vs missing keywords.

---

### 6. Cover letter (1.5 min) - Extension Cover tab

**Show:** **Cover** tab

**Do:**

1. **Generate cover letter** (job context often carries over from ATS).
2. **Copy output** or **Download PDF**.

**Say something like:**

> Same job, but now a cover letter pulled from your actual experience - not one of those "Dear Hiring Manager, I am passionate about synergising..." templates. You still paste or attach it yourself on most forms.

---

### 7. Wrap up (30 sec) - Dashboard → Usage

**Show:** **Usage**

**Say something like:**

> Uploading your CV and editing the profile doesn't cost anything. Credits are for the AI bits - drafting answers, scoring, cover letters. Free tier gives you 250 a month; if you're applying seriously you'll probably want more.

**If you have time:**

> There's also a LinkedIn mode that goes further - search, score, fill, and actually submit Easy Apply jobs. Happy to show that if people are interested.

---

## Track B: LinkedIn Auto Apply (~5 min extra)

For audiences who basically live on LinkedIn, or when someone asks "but does it actually apply for you?"

**Before you start:** logged into LinkedIn, extension connected, **50+ credits** if fit gate is on (5 per job in the batch).

### Setup

**Show:** **Auto Apply** tab

**Say something like:**

> This one's different. On LinkedIn Easy Apply we can run the whole thing - find jobs, open them, work through the modal, submit. Everything else in the platform dropdown is still "coming soon".

**Set on screen:**

| Control | Demo value | Why |
|---------|------------|-----|
| **Platform** | LinkedIn | |
| **Max** | 3 | Small batch - demos go wrong less often |
| **Role** | something realistic, e.g. `product marketing manager remote UK` | |
| **Search filters** | location, remote, past week | open the collapsible section |
| **Skip below fit score** | on | |
| **Min** | 45 | explain you're not applying to obvious mismatches |

**Say something like:**

> Each job we score costs five credits. If the listing is basically empty we skip it. Watch the activity log - it'll tell you exactly why something got skipped or went through.

### Run it

**Click:** **Start**

**Talk through the activity log** (**Show activity**):

- scored and applying
- skipped - fit too low
- skipped - job description too short to bother

**If it pauses** on a weird question:

1. **Paused** banner
2. **We need your help**
3. Answer → **Save & fill**
4. It picks up again

**Click:** **Stop** once you've shown one apply or one clear skip. No need to run the full batch.

**Say something like:**

> It's deliberately not instant - gaps between jobs, between fields. LinkedIn notices bots. If you hit a checkpoint, solve it in the browser and either continue or bail and show the ATS flow instead.

---

## If someone asks...

| Question | Rough answer |
|----------|--------------|
| Are you applying without me knowing? | No. LinkedIn only runs when you press Start. Everywhere else, you submit. |
| What do you do with my data? | It stays in your account. The extension talks to the API with a token you can revoke. |
| Will this get me flagged as a bot? | We type gradually, not dump a paste. On ATS sites you review before submit anyway. |
| Which sites? | Autofill works on a lot of ATS platforms - Greenhouse, Ashby, Workday, Lever, others. Full auto-submit is LinkedIn Easy Apply for now. |
| Price? | Free tier, 250 credits/month. Paid plans if you're doing volume. |
| Is it open source? | Code's on GitHub - PolyForm Noncommercial licence. |

---

## When something breaks mid-demo

| What happened | Try this |
|---------------|----------|
| No **Draft All** button | Side panel open? On the actual form page? Extension connected? |
| Button flashed and vanished | Keep panel open, refresh the apply page once |
| Draft All stuck | Credits left? Network? Try a simpler form |
| ATS/Cover complains about description | Paste more of the job spec - needs a decent chunk of text |
| LinkedIn sitting there doing nothing | Easy Apply jobs only - check the activity log for skips |
| LinkedIn checkpoint | Solve it manually, shrink the batch, or pivot to Track A |
| Extension disconnected | Paste connection JSON again from the dashboard |

---

## Shorter versions

### ~3 minutes

1. Homepage widget - "this is the idea" (30 s)
2. Quick profile glance (30 s)
3. Real form, **Draft All**, scroll the results (90 s)
4. "We fill, you submit" + mention LinkedIn if asked (30 s)

### ~20 minutes

Track A, then Track B, then Usage/pricing and whatever questions land (trust, GitHub, how forms are tested, etc.).

---

## Day-of checklist

```
[ ] Credits > 100 (or > 50 for LinkedIn-only)
[ ] Extension connected, side panel pinned
[ ] CV parsed, Preferences filled
[ ] Application Q&A has a couple of answers
[ ] Greenhouse/Ashby apply URL bookmarked
[ ] LinkedIn logged in (if doing Track B)
[ ] Connection JSON saved somewhere
[ ] Slack/email/notifications off
```
