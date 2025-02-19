/**
 * this is wrong, but its better than 0
 * @swagger
 * /v2/databases/{database}/auth/signin:
 *   post:
 *     tags:
 *     - auth
 *     summary: Sign in to the application
 *     description: Authenticates a user and creates a session.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: yourpassword
 *             required:
 *               - email
 *               - password
 *     responses:
 *       '200':
 *         description: Successful authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: User Name
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: user@example.com
 *                     image:
 *                       type: string
 *                       format: uri
 *                       example: https://example.com/user.png
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 * /v2/databases/{database}/auth/signout:
 *   post:
 *     tags:
 *       - auth
 *     summary: Sign out of the application
 *     description: Ends the user session.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     responses:
 *       '200':
 *         description: Successful sign out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Signed out
 * /v2/databases/{database}/auth/session:
 *   get:
 *     tags:
 *       - auth
 *     summary: Get the current session
 *     description: Returns the session object if the user is authenticated.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     responses:
 *       '200':
 *         description: The current session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: User Name
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: user@example.com
 *                     image:
 *                       type: string
 *                       format: uri
 *                       example: https://example.com/user.png
 *                 expires:
 *                   type: string
 *                   format: date-time
 *                   example: 2024-07-16T19:20:30.45Z
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 * /v2/databases/{database}/auth/csrf:
 *   get:
 *     tags:
 *       - auth
 *     summary: Get CSRF token
 *     description: Returns a CSRF token to be used in subsequent requests.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     responses:
 *       '200':
 *         description: CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 csrfToken:
 *                   type: string
 *                   example: abc123
 * /v2/databases/{database}/auth/providers:
 *   get:
 *     tags:
 *       - auth
 *     summary: Get available providers
 *     description: Returns a list of available authentication providers.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     responses:
 *       '200':
 *         description: List of providers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: github
 *                   name:
 *                     type: string
 *                     example: GitHub
 *                   type:
 *                     type: string
 *                     example: oauth
 * /v2/databases/{database}/auth/callback/{provider}:
 *   post:
 *     tags:
 *       - auth
 *     summary: Handle provider callback
 *     description: Handles the callback from an authentication provider.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *       - $ref: '#/components/parameters/provider'
 *     responses:
 *       '200':
 *         description: Successful callback
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: User Name
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: user@example.com
 *                     image:
 *                       type: string
 *                       format: uri
 *                       example: https://example.com/user.png
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 * /v2/databases/{database}/auth/session/token:
 *   post:
 *     tags:
 *       - auth
 *     summary: Refresh session token
 *     description: Refreshes the session token to extend the session duration.
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     responses:
 *       '200':
 *         description: Session token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: User Name
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: user@example.com
 *                     image:
 *                       type: string
 *                       format: uri
 *                       example: https://example.com/user.png
 *                 expires:
 *                   type: string
 *                   format: date-time
 *                   example: 2024-07-16T19:20:30.45Z
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 */
