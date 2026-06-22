# API Documentation - SafeHer Backend

This document details the available REST API endpoints for the SafeHer Women Safety App backend, their expected inputs, responses, and authentication requirements.

## Authentication Overview

The SafeHer backend utilizes **Supabase JWT (JSON Web Tokens)** for securing API endpoints.

### JWT Authentication Flow
1. **Login/Signup**: The client authenticates directly via Supabase Auth (or via future FastAPI `/api/auth/login` wrappers) and receives an `access_token`.
2. **API Requests**: The client includes this `access_token` in the headers of all subsequent requests to protected API routes.
3. **Validation**: The FastAPI backend extracts the token, verifies it against the Supabase Auth server, and extracts the authenticated `user_id`.
4. **Database Access**: The backend processes the request and interacts with the database. Row Level Security (RLS) ensures the user can only access their own data.

### Authorization Header Format
For all protected endpoints, provide the JWT in the `Authorization` header:
```
Authorization: Bearer <your_supabase_jwt_token>
```

### Common Error Codes
- **400 Bad Request**: Missing or malformed data in the request body.
- **401 Unauthorized**: Missing, expired, or invalid JWT token.
- **403 Forbidden**: Token is valid, but the user lacks permissions for the requested resource.
- **404 Not Found**: The requested resource does not exist.
- **422 Unprocessable Entity**: Request body failed validation (e.g., incorrect data types, missing required fields).
- **500 Internal Server Error**: An unexpected issue occurred on the backend.

---

## Endpoints

### 1. Get Current User (`GET /api/auth/me`)

**Purpose**: Retrieves the profile information of the currently authenticated user based on their JWT.

- **HTTP Method**: `GET`
- **URL**: `/api/auth/me`
- **Authentication Required**: Yes (Bearer Token)
- **Request Body**: None

**Example Request**:
```bash
curl -X GET "https://api.safeher.app/api/auth/me" \
     -H "Authorization: Bearer eyJhbGci..."
```

**Response Schema**:
```json
{
  "id": "uuid",
  "email": "string",
  "name": "string",
  "phone_number": "string"
}
```

**Example Response**:
```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "email": "user@example.com",
  "name": "Jane Doe",
  "phone_number": "+1234567890"
}
```

**Error Responses**:
- `401 Unauthorized`: "Invalid authentication credentials"

---

### 2. Create SOS Alert (`POST /api/alerts`)

**Purpose**: Triggers a new emergency SOS alert for the authenticated user.

- **HTTP Method**: `POST`
- **URL**: `/api/alerts`
- **Authentication Required**: Yes (Bearer Token)
- **Request Body Schema**:
  ```json
  {
    "trigger_type": "MANUAL_SOS | SILENT_SOS",
    "status": "ACTIVE",
    "cancel_method": "REAL_PIN | DURESS_PIN | NONE",
    "visible_message": "string (optional)",
    "latitude": "float (optional, -90 to 90)",
    "longitude": "float (optional, -180 to 180)",
    "map_link": "string (optional)"
  }
  ```
  *(Note: The `user_id` is automatically extracted from the JWT and should not be included in the body. If included, it will be safely ignored or rejected.)*

**Example Request**:
```bash
curl -X POST "https://api.safeher.app/api/alerts" \
     -H "Authorization: Bearer eyJhbGci..." \
     -H "Content-Type: application/json" \
     -d '{
           "trigger_type": "MANUAL_SOS",
           "status": "ACTIVE",
           "latitude": 37.7749,
           "longitude": -122.4194
         }'
```

**Response Schema**:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "trigger_type": "string",
  "status": "string",
  "cancel_method": "string",
  "visible_message": "string",
  "latitude": "float",
  "longitude": "float",
  "map_link": "string",
  "created_at": "timestamp",
  "cancelled_at": "timestamp"
}
```

**Example Response**:
```json
{
  "id": "8a32b90c-444a-4a6f-998f-0a0a0a0a0a0a",
  "user_id": "11111111-1111-1111-1111-111111111111",
  "trigger_type": "MANUAL_SOS",
  "status": "ACTIVE",
  "cancel_method": "NONE",
  "visible_message": null,
  "latitude": 37.7749,
  "longitude": -122.4194,
  "map_link": null,
  "created_at": "2026-06-22T10:00:00Z",
  "cancelled_at": null
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid token.
- `422 Unprocessable Entity`: Invalid coordinates or missing required fields.

---

### 3. Link Guardian (`POST /api/guardians/link`)

**Purpose**: Allows the authenticated user to link a guardian account to their profile using the guardian's email address.

- **HTTP Method**: `POST`
- **URL**: `/api/guardians/link`
- **Authentication Required**: Yes (Bearer Token)
- **Request Body Schema**:
  ```json
  {
    "guardian_email": "string (email format)"
  }
  ```

**Example Request**:
```bash
curl -X POST "https://api.safeher.app/api/guardians/link" \
     -H "Authorization: Bearer eyJhbGci..." \
     -H "Content-Type: application/json" \
     -d '{
           "guardian_email": "guardian@example.com"
         }'
```

**Response Schema**:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "guardian_id": "uuid",
  "status": "string",
  "created_at": "timestamp"
}
```

**Example Response**:
```json
{
  "id": "f583e2a2-3f8c-4a39-b9d9-bbbbbbbbbbbb",
  "user_id": "11111111-1111-1111-1111-111111111111",
  "guardian_id": "22222222-2222-2222-2222-222222222222",
  "status": "PENDING",
  "created_at": "2026-06-22T10:05:00Z"
}
```

**Error Responses**:
- `400 Bad Request`: Guardian is already linked, or attempting to link self.
- `401 Unauthorized`: Missing or invalid token.
- `404 Not Found`: Guardian email not registered in the system.
- `422 Unprocessable Entity`: Invalid email format.
