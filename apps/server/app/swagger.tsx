// A place for common schemas

/**
 *
 * @swagger
 * components:
 *   securitySchemes:
 *    sessionCookie:
 *      type: apiKey
 *      in: cookie
 *      name: nile-auth.session-token
 *      description: "Session token stored in a cookie after user signs in, prefixed with __Secure if on https"
 *   parameters:
 *     database:
 *        name: database
 *        in: path
 *        required: true
 *        schema:
 *          type: string
 *        description: The string (id or name, depending on the credentials)
 *     provider:
 *        name: provider
 *        in: path
 *        required: true
 *        schema:
 *          type: string
 *        description: the name of the provider (credentials, google, etc)
 *   schemas:
 *     PasswordTokenPayload:
 *       type: object
 *       required:
 *         - callbackUrl
 *         - email
 *         - redirectUrl
 *       properties:
 *         callbackUrl:
 *           type: string
 *         email:
 *           type: string
 *         redirectUrl:
 *           type: string
 *     ResetPassword:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *         password:
 *           type: string
 *     CreateUser:
 *       required:
 *         - email
 *         - password
 *       type: object
 *       properties:
 *         email:
 *           type: string
 *         password:
 *           type: string
 *         name:
 *           type: string
 *         givenName:
 *           type: string
 *         familyName:
 *           type: string
 *         picture:
 *           type: string
 *     LinkUser:
 *       type: object
 *       required:
 *         - id
 *       properties:
 *         id:
 *           type: string
 *     UpdateUser:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         givenName:
 *           type: string
 *         familyName:
 *           type: string
 *         picture:
 *           type: string
 *     CreateTenantRequest:
 *       required:
 *         - name
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         id:
 *           type: string
 *           description: The desired uuidv7 of the tenant
 *     Tenant:
 *       required:
 *         - id
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *     UpdateTenant:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         tenants:
 *           uniqueItems: true
 *           type: array
 *           items:
 *             type: string
 *         email:
 *           type: string
 *         name:
 *           type: string
 *         givenName:
 *           type: string
 *         familyName:
 *           type: string
 *         picture:
 *           type: string
 *         emailVerified:
 *           type: string
 *           format: date-time
 *         created:
 *           type: string
 *           format: date-time
 *         updated:
 *           type: string
 *           format: date-time
 *     TenantUser:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *         name:
 *           type: string
 *         givenName:
 *           type: string
 *         familyName:
 *           type: string
 *         picture:
 *           type: string
 *         created:
 *           type: string
 *           format: date-time
 *         emailVerified:
 *           type: string
 *           format: date-time
 *         updated:
 *           type: string
 *           format: date-time
 *     APIError:
 *       type: string
 *     MfaVerifyRequest:
 *       type: object
 *       required:
 *         - token
 *         - code
 *       properties:
 *         token:
 *           type: string
 *           description: Base64URL encoded MFA challenge token issued during login or setup.
 *         code:
 *           type: string
 *           description: Time-bound one time passcode (email OTP or authenticator TOTP) that proves possession of the second factor.
 *     MfaVerifyResponse:
 *       type: object
 *       required:
 *         - ok
 *         - scope
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Indicates that the MFA challenge was satisfied.
 *         scope:
 *           type: string
 *           description: Identifies whether the challenge corresponded to a login flow or an MFA setup flow.
 *           enum:
 *             - challenge
 *             - setup
 *     MfaSetupResponse:
 *       type: object
 *       required:
 *         - ok
 *         - method
 *         - token
 *         - expiresAt
 *         - scope
 *       properties:
 *         ok:
 *           type: boolean
 *         method:
 *           type: string
 *           enum:
 *             - authenticator
 *             - email
 *         token:
 *           type: string
 *         expiresAt:
 *           type: string
 *           format: date-time
 *         scope:
 *           type: string
 *           enum:
 *             - setup
 *         otpauthUrl:
 *           type: string
 *           description: Present when the user is enrolling an authenticator app.
 *         secret:
 *           type: string
 *           description: Base32 secret returned for authenticator enrollment.
 *         maskedEmail:
 *           type: string
 *           description: Masked email address used for email OTP delivery.
 *     MfaDisableRequest:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: Raw MFA challenge token issued during login or setup. Required when verifying email MFA.
 *         scope:
 *           type: string
 *           enum:
 *             - challenge
 *             - setup
 *           description: Indicates the origin of the token.
 *         method:
 *           type: string
 *           enum:
 *             - authenticator
 *             - email
 *           description: Expected MFA method for the disable request.
 *         code:
 *           type: string
 *           description: One-time passcode submitted to confirm MFA ownership.
 *         requireCode:
 *           type: boolean
 *           description: Forces the server to verify `code` before disabling MFA.
 *     MfaDisableResponse:
 *       type: object
 *       required:
 *         - ok
 *         - method
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Indicates that MFA has been disabled for the user.
 *         method:
 *           type: string
 *           enum:
 *             - authenticator
 *             - email
 *           description: MFA method that was removed.
 */
