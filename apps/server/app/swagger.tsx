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
 *         - callbackURL
 *         - email
 *       properties:
 *         callbackURL:
 *           type: string
 *         email:
 *           type: string
 *         redirectURL:
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
 *       required:
 *         - errorCode
 *         - message
 *         - statusCode
 *       type: object
 *       properties:
 *         errorCode:
 *           type: string
 *           enum:
 *             - internal_error
 *             - bad_request
 *             - unsupported_operation
 *             - entity_not_found
 *             - duplicate_entity
 *             - invalid_credentials
 *             - unknown_oidc_provider
 *             - unknown_oidc_party
 *             - provider_already_exists
 *             - provider_config_error
 *             - provider_mismatch
 *             - provider_update_error
 *             - provider_disabled
 *             - session_state_missing
 *             - session_state_mismatch
 *             - oidc_code_missing
 *             - tenant_not_found
 *             - constraint_violation
 *             - sql_exception
 *             - db_creation_failure
 *             - db_status_failure
 *             - db_initialization_failure
 *             - db_config_missing
 *             - unauthorized_workspace_access
 *             - email_send_failure
 *             - jdbc_exception
 *             - oidc_exception
 *             - region_mismatch
 *             - credential_creation_failure
 *             - credential_propagation_failure
 *         message:
 *           type: string
 *         statusCode:
 *           type: integer
 *           format: int32
 */
