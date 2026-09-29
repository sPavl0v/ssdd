---
ssdd: 1
version: 0
---
# Login app

Example app for ssdd: a login page and logout for a customer web app.

- [1] Login page
  - [1.a] Form
    - [1.a.1] Shows email and password fields
    - [1.a.2] Submit is disabled until both fields are filled
  - [1.b] Validation
    - [1.b.1] Rejects an email without "@" with "Enter a valid email"
    - [1.b.2] Rejects a password shorter than 8 characters with "Password must be at least 8 characters"
  - [1.c] Submit
    - [1.c.1] Valid credentials start a session and redirect to /home
    - [1.c.2] Wrong credentials show "Email or password is incorrect" and keep the email
    - [1.c.3] Locks the account for 15 minutes after 5 failed attempts
      Shows "Too many attempts, try again in 15 minutes".
- [2] Logout
  - [2.a] Ends the session and redirects to /login
