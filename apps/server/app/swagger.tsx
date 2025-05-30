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
 */
