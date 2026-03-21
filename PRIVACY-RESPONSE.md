# Addressing Privacy & Safety Concerns

## Our Commitment to Student Privacy

Option is built by students, for students. We take the privacy and safety of our users — the majority of whom are high schoolers — seriously. This document addresses common concerns raised by parents, educators, and the broader community.

---

## Frequently Asked Questions

### What data does Option collect?

Option collects only what's necessary to provide its core features:

- **Account info**: Email address and a display name for your profile
- **Academic data**: Grades, GPA, and course information imported from StudentVUE (only when you choose to connect it)
- **Task & calendar data**: Assignments and events you create or import
- **Focus session data**: Pomodoro timer usage and focus scores
- **Friend connections**: Friend codes and leaderboard participation

We do **not** collect browsing history, location data, contacts, photos, or any data unrelated to academic productivity.

### Who can see my data?

- **Your grades and tasks are private.** Only you can see your academic data.
- **Leaderboard data is limited.** Friends and schoolmates can only see your display name and focus score — never your grades, GPA, or assignments.
- **We do not sell or share personal data with third parties.** Period.

### How is my data stored and protected?

- All data is stored securely using [Supabase](https://supabase.com), which provides enterprise-grade PostgreSQL databases with row-level security.
- Communication between the app and our servers is encrypted via HTTPS/TLS.
- Authentication is handled through Supabase Auth with industry-standard practices.

### Does the Chrome extension track my browsing?

No. The Option Chrome extension is a **website blocker only**. It checks URLs against a list of sites you choose to block during focus sessions. It does not:

- Record or transmit your browsing history
- Track which websites you visit
- Send any browsing data to our servers

The extension's source code uses Manifest V3, which has stricter privacy controls enforced by Google.

### Is Option compliant with student privacy laws?

We are committed to aligning with student privacy regulations:

- **FERPA**: We do not act as a school official or access education records without student-initiated consent. Students voluntarily choose to import their own grades.
- **COPPA**: Option is designed for high school students (ages 13+). We do not knowingly collect data from children under 13.
- **State laws**: We are actively working to ensure compliance with state-level student privacy laws as we grow.

### Can parents monitor or control their child's account?

We respect that parents want visibility into tools their children use. Currently:

- Parents can review the app with their child at any time
- Account deletion is available at any time through the app settings
- We are exploring parental controls and oversight features for a future update

### What happens if I delete my account?

When you delete your account, all associated data — grades, tasks, focus history, and friend connections — is permanently removed from our servers. There is no retention period.

### How does the social/leaderboard feature work?

- Leaderboards are **opt-in** and display only your chosen display name and focus score.
- Friends are added via unique friend codes — there is no public directory or search by real name.
- No academic data (grades, GPA, assignments) is ever visible to other users.

---

## Our Principles

1. **Minimal data collection** — We only collect what the app needs to function.
2. **Student control** — You own your data and can delete it at any time.
3. **Transparency** — We're open about what we collect, how we use it, and who can see it.
4. **No ads, no data sales** — We do not monetize user data.
5. **Security first** — Industry-standard encryption and access controls protect your information.

---

## Contact Us

Have a privacy concern or question? Reach out:

- **Email**: [Add your contact email here]
- **GitHub**: Open an issue on our repository

We welcome feedback from students, parents, and educators. Privacy isn't a checkbox for us — it's foundational to how we build Option.
