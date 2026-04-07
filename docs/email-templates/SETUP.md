# Custom Auth Emails Setup Guide

## Step 1: Create a Resend Account (Free)
1. Go to https://resend.com and sign up
2. Go to **API Keys** → Create a new key → copy it
3. (Optional) Go to **Domains** → Add your domain for a custom from address

## Step 2: Configure SMTP in Supabase
1. Go to https://supabase.com/dashboard → your project
2. **Project Settings** → **Authentication** → scroll to **SMTP Settings**
3. Toggle **Enable Custom SMTP** → ON
4. Fill in:
   - **Sender email**: `team@option-app.com` (or your email)
   - **Sender name**: `Option`
   - **Host**: `smtp.resend.com`
   - **Port number**: `465`
   - **Username**: `resend`
   - **Password**: `re_YOUR_API_KEY_HERE`
5. Click **Save**

## Step 3: Paste Email Templates
1. Go to **Authentication** → **Email Templates**
2. For each template type, paste the corresponding HTML file:
   - **Confirm signup** → `confirm-signup.html` (Subject: `Verify your Option account`)
   - **Reset password** → `reset-password.html` (Subject: `Reset your Option password`)
   - **Magic link** → `magic-link.html` (Subject: `Sign in to Option`)
   - **Invite user** → `invite-user.html` (Subject: `You're invited to Option`)
3. Click **Save** for each

## Step 4: Test
1. Create a new account in Option
2. Check your inbox — the email should come from "Option <team@option-app.com>"
3. The email should have the dark theme matching the app

## Alternative SMTP Providers
If you don't want to use Resend:

### Gmail SMTP (quick testing)
- Host: `smtp.gmail.com`
- Port: `465`
- Username: your Gmail address
- Password: App Password (generate at https://myaccount.google.com/apppasswords)
- Note: Enable 2FA first, then create an App Password

### SendGrid
- Host: `smtp.sendgrid.net`
- Port: `465`
- Username: `apikey`
- Password: your SendGrid API key
