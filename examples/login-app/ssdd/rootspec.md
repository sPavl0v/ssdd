---
ssdd: 1
version: 0
---
# Login app

Example app for ssdd: a login page and logout for a customer web app. The app reads the
registered emails and the password of each email from the user store.

- [1] Login page
  - [1.a] Login form
    - [1.a.1] The Login form shows the Email input above the Password input.
    - [1.a.2] The result of a submit comes from the first check that fails, in this order: the Email and Password rules, the Account lock, the credentials.
    - [1.a.3] The credentials are valid when the Email value is a registered email and the Password value is the password of that email.
    - [1.a.4] When a submit passes all checks, the app opens /home with a new active session.
    - [1.a.5] When a submit fails the credentials check, the Error list shows "Email or password is incorrect".
    - [1.a.6] When a submit fails a check, the Email value does not change.
    - [1.a.7] When a submit fails a check, the Password value becomes empty.
    - [1.a.8] Email input
      - [1.a.8.a] The Email value is valid when it contains the character "@".
      - [1.a.8.b] When a submit has an Email value that is not valid, the Error list shows "Enter a valid email".
    - [1.a.9] Password input
      - [1.a.9.a] The Password value is valid when it has 8 or more characters.
      - [1.a.9.b] When a submit has a Password value that is not valid, the Error list shows "Password must be at least 8 characters".
    - [1.a.10] Submit button
      - [1.a.10.a] While the Email value is empty or contains only whitespace characters, or the Password value is empty, the Submit button is disabled.
      - [1.a.10.b] While the Email value contains a character that is not whitespace and the Password value is not empty, the Submit button is enabled.
    - [1.a.11] Error list
      - [1.a.11.a] The Error list shows only the errors of the last submit, in this order: the Email error, the Password error, the lock error, the credentials error.
  - [1.b] Account lock
    - [1.b.1] The failed attempt count of an email is 0 until the first submit with that email that fails the credentials check.
    - [1.b.2] When a submit fails the credentials check, the failed attempt count of its email increases by 1.
    - [1.b.3] When a submit passes all checks, the failed attempt count of its email becomes 0.
    - [1.b.4] When the failed attempt count of an email becomes 5 or more, the Account lock locks that email until 900000 ms after that submit.
    - [1.b.5] When a submit has an email that is locked, the Error list shows "Too many attempts, try again in 15 minutes".
- [2] Logout
  - [2.a] When the user logs out, the app ends the active session of the user.
  - [2.b] When the user logs out, the app opens /login.
