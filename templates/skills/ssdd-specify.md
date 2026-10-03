---
description: Turn a feature request into ssdd spec nodes (add, change, move or remove)
argumentHint: "<what to add or change, e.g. [1.a.2] on focus make outline blue>"
---
You are editing this project's spec. The spec tree is the source of truth; you change the spec
only, never code or tests.

Request: {{ARGS}}

1. Empty request → reply "Describe what to add or change, e.g. /{{PREFIX}}-specify [1.a] add a
   password field" and stop.
2. Run `{{CLI}} context --for specify` and read the whole output: the Target section is the
   whole tree with every node's label, and nodes mounted with `ref:<feature>` show the file
   they live in. Spec errors → show them and stop.
3. Paths in the request (`[1.a.2]`, `1.a.2`) name existing nodes by their current label.
   Change exactly those nodes and their subtrees. A path that does not exist → say so, show
   the nearest existing parent and its children, and stop. Without paths, find the place in
   the tree where the request belongs; nothing fits → add a new top-level node.
4. Structure every node you add or rewrite by this standard:
   - A node is an element of the product, nested the way the product nests: page or screen →
     section or component → element (field, button, list item), as deep as needed. Non-UI
     parts follow the same idea (API → endpoint → parameter; job → step).
   - A leaf is one behavior of its parent element: one trigger or state and one observable
     result.
   - An element never sits under a behavior; behaviors never have children. A behavior that
     needs its own elements means a missing element node: create it.
   - One behavior per leaf; split "and"s into separate leaves.
5. Write every leaf in ASD-STE100 Simplified Technical English. Give each element node a
   short noun title. A leaf has exactly one interpretation: two agents that read it build
   the same behavior.
   - Use one of these sentence forms for a leaf:
     `When <trigger>, <result>.` · `While <state>, <result>.` · `The <element> <is|shows> <value>.` ·
     `The <value> is valid when <rule>.`
     A leaf has one such sentence. It can add sentences that only define its placeholders or
     its terms.
   - Use the simple present tense and the active voice. Write a sentence of 25 words or
     fewer; a value in quotes or backticks counts as one word. Use "the" and "a". Do not use
     contractions, phrasal verbs or slang.
   - Use one word for one meaning and one name for one thing. Refer to an element by the
     exact title of its node. Do not use synonyms.
   - Refer to other nodes by their titles. Do not refer to a node by its label or path
     ("from step 1.a.3.b"): labels change when nodes move.
   - Name each trigger exactly: a user action (clicks <element>, presses <key> in <element>,
     types a character in <element>, changes <value>, <element> gets focus, <element> loses
     focus) or a system event (<page> opens, the <request> response has status <code>,
     <n> ms pass).
   - Write each value literally: displayed text in double quotes, character for character;
     numbers with their unit; colors as hex codes; durations in ms; limits as inclusive
     bounds; patterns as regular expressions.
   - Write dynamic text as a template with `<placeholders>`. In the same leaf, define each
     placeholder: its source, its type and its format (integer or decimal places, rounding,
     leading zeros, separators).
   - Write each rule once, in a `The <value> is valid when <rule>.` leaf under its element.
     Other leaves refer to it by name ("the Email value is not valid"). Do not copy the rule.
   - Every state that a leaf starts (shown, hidden, disabled, locked, open) has a defined
     start, end and initial state: write a `While <state>` leaf, or write the leaves that
     start it and end it, and the leaf for its state when the page opens.
   - A request to a server names the method, the path and the body as a template. Write a
     separate leaf for the result of: the success status, each error status the product
     handles, every other status, and no response within a timeout in ms.
   - Do not write examples. Do not use "e.g.", "for example", "such as", "like", "i.e.",
     "etc." or "and so on". An example is not a definition: write the rule that gives the
     result for every input.
   - Do not use vague words: appropriate, proper, correct, valid (without its rule),
     reasonable, normal, fast, slow, large, small, some, several, many, few, usually,
     generally, if needed, as required, user-friendly, clear, nice, may, might, should,
     could, can. Write the exact rule or value instead.
   - Do not use a verb without its result: "validate", "handle", "process", "prepare",
     "update" and "support" need the rule and the observable result of each outcome.
   - Write a separate leaf for each edge case that changes the result: empty, zero,
     minimum, maximum, over the limit, error.
   - The request does not give an exact value → choose one value that agrees with the
     existing spec, write it exactly, and list it under Assumptions.
   Example:
   ```
   - Login page
     - Login form
       - When the user presses Enter in the Email input or the Password input, the app does the same as a click on the Submit button.
       - When the POST /login response has status 200, the app opens /home.
       - Email input
         - The Email value is valid when, without leading and trailing whitespace, it matches `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
         - While the Email input has focus, its outline color is #2E7D32.
         - While the Email input has no focus, its outline color is #BDBDBD.
         - When the user clicks the Submit button and the Email value is not valid, the Email input shows the error "Enter a valid email address".
         - When the user changes the Email value, the Email input hides its error.
         - When the Login page opens, the Email input shows no error.
       - Password input
         - The Password value is valid when it has 8 or more characters.
         - While the Password input has focus, its outline color is #1565C0.
         - While the Password input has no focus, its outline color is #BDBDBD.
         - When the user types a character in the Password input, the Password input shows "*" in place of that character.
         - When the user clicks the Submit button and the Password value is not valid, the Password input shows the error "Password must be at least 8 characters".
         - When the user changes the Password value, the Password input hides its error.
         - When the Login page opens, the Password input shows no error.
       - Submit button
         - When the user clicks the Submit button and the Email value or the Password value is not valid, the app sends no request.
         - When the user clicks the Submit button and both values are valid, the app sends POST /login with the JSON body `{"email": <email>, "password": <password>}`.
           <email> is the Email value without leading and trailing whitespace, as a JSON string. <password> is the Password value, as a JSON string.
         - While a POST /login request is open, the Submit button is disabled.
           A request is open until its response arrives or 10000 ms pass.
       - Error message
         - When the Login page opens, the Error message is hidden.
         - When the user clicks the Submit button, the Error message is hidden.
         - When the POST /login response has status 401, the Error message shows "Email or password is incorrect".
         - When the POST /login response has a status other than 200 and 401, or the request closes without a response, the Error message shows "Login failed. Try again.".
   ```
   Existing nodes that do not follow the standard: restructure only those the request
   touches; list the others under Suggested restructuring instead of changing them.
6. Edit the file each node lives in (`ssdd/rootspec.md`, or `ssdd/specs/<feature>/spec.md` for
   a `ref:` mount). Keep the file's bullet style and indentation. New nodes need no label:
   write `- <title>`; the CLI assigns labels. Never renumber labels by hand. Keep the spec free of
   implementation details (file names, libraries, code) unless the request is about them;
   those belong in the Tech stack. Do not edit constitution.md, techstack.md or memory.md.
7. Ambiguous request → choose the reading most consistent with the existing spec and list it
   under Assumptions. A request that conflicts with the Constitution → stop and report.
8. Check every node you added or rewrote against steps 4 and 5. A node that fails a rule →
   rewrite it and check it again.
9. Run `{{CLI}} context --for implement` to assign labels and check the spec. Spec errors →
   fix your edit and rerun.
10. Reply with: the changed subtrees with their new labels, a list of changes (added /
    modified / moved / removed, with paths), Assumptions, Suggested restructuring, and the
    line "Run /{{PREFIX}}-implement to build it."
    Never run git commit or push.
