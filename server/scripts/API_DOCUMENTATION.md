# Scripts API Documentation

## Overview

The Scripts API provides CRUD operations for managing script files stored in Vercel Blob storage. All endpoints require authentication.

## Base URL

```
/api/scripts/
```

## Authentication

All endpoints require authentication. Include the authentication token in the request headers.

## Endpoints

### 1. List All Scripts

**GET** `/api/scripts/`

Lists all scripts owned by the authenticated user.

**Response:**

```json
{
  "success": true,
  "message": "Scripts retrieved successfully.",
  "data": [
    {
      "id": 1,
      "name": "example_script",
      "pathname": "scripts/example_script.py",
      "blob_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/example_script.py",
      "download_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/example_script.py",
      "owner": 1,
      "owner_username": "john_doe",
      "content_type": "text/x-python",
      "file_size": 1024,
      "uploaded_at": "2026-02-03T10:30:00Z",
      "updated_at": "2026-02-03T10:30:00Z",
      "version": 1
    }
  ],
  "errors": null
}
```

---

### 2. Create New Script

**POST** `/api/scripts/`

Creates a new script and uploads its content to Vercel Blob storage.

**Request Body:**

```json
{
  "name": "my_script",
  "language": "python",
  "content": "print('Hello, World!')"
}
```

**Supported Languages:**

- `javascript`, `typescript`, `python`, `java`, `cpp`, `c`, `csharp`, `go`, `rust`, `ruby`, `php`, `swift`, `kotlin`, `shell`, `bash`, `sql`, `html`, `css`, `json`, `xml`, `yaml`, `markdown`

**Validation Rules:**

- `name`: Required, alphanumeric with underscores and hyphens only
- `language`: Required, must be from supported languages list
- `content`: Required, cannot be empty

**Success Response (201):**

```json
{
  "success": true,
  "message": "Script created successfully.",
  "data": {
    "id": 1,
    "name": "my_script",
    "pathname": "scripts/my_script.py",
    "blob_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/my_script.py",
    "download_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/my_script.py",
    "owner": 1,
    "owner_username": "john_doe",
    "content_type": "text/x-python",
    "file_size": 22,
    "uploaded_at": "2026-02-03T10:30:00Z",
    "updated_at": "2026-02-03T10:30:00Z",
    "version": 1
  },
  "errors": null
}
```

**Error Response (400):**

```json
{
  "success": false,
  "message": "Validation failed.",
  "data": null,
  "errors": {
    "name": ["Script with this name already exists."]
  }
}
```

---

### 3. Get Script Details

**GET** `/api/scripts/<id>/`

Retrieves metadata for a specific script.

**Success Response (200):**

```json
{
  "success": true,
  "message": "Script retrieved successfully.",
  "data": {
    "id": 1,
    "name": "my_script",
    "pathname": "scripts/my_script.py",
    "blob_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/my_script.py",
    "download_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/my_script.py",
    "owner": 1,
    "owner_username": "john_doe",
    "content_type": "text/x-python",
    "file_size": 22,
    "uploaded_at": "2026-02-03T10:30:00Z",
    "updated_at": "2026-02-03T10:30:00Z",
    "version": 1
  },
  "errors": null
}
```

---

### 4. Get Script Content

**GET** `/api/scripts/<id>/content/`

Fetches the actual content of the script from Vercel Blob storage.

**Success Response (200):**

```json
{
  "success": true,
  "message": "Script content retrieved successfully.",
  "data": {
    "name": "my_script",
    "pathname": "scripts/my_script.py",
    "content": "print('Hello, World!')",
    "language": "python",
    "content_type": "text/x-python",
    "file_size": 22,
    "version": 1,
    "uploaded_at": "2026-02-03T10:30:00Z",
    "updated_at": "2026-02-03T10:30:00Z"
  },
  "errors": null
}
```

---

### 5. Update Script Content

**PUT** `/api/scripts/<id>/update/`

Updates the content of an existing script and increments its version.

**Request Body:**

```json
{
  "content": "print('Hello, Updated World!')"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Script updated successfully to version 2.",
  "data": {
    "id": 1,
    "name": "my_script",
    "pathname": "scripts/my_script.py",
    "blob_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/my_script.py",
    "download_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/my_script.py",
    "owner": 1,
    "owner_username": "john_doe",
    "content_type": "text/x-python",
    "file_size": 30,
    "uploaded_at": "2026-02-03T10:30:00Z",
    "updated_at": "2026-02-03T10:35:00Z",
    "version": 2
  },
  "errors": null
}
```

---

### 6. Rename Script

**POST** `/api/scripts/<id>/rename/`

Renames a script and updates its pathname in Vercel Blob storage.

**Request Body:**

```json
{
  "new_name": "renamed_script"
}
```

**Validation Rules:**

- `new_name`: Required, alphanumeric with underscores and hyphens only
- Must not conflict with existing script names

**Success Response (200):**

```json
{
  "success": true,
  "message": "Script renamed from 'my_script' to 'renamed_script' successfully.",
  "data": {
    "id": 1,
    "name": "renamed_script",
    "pathname": "scripts/renamed_script.py",
    "blob_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/renamed_script.py",
    "download_url": "https://lwcs2ctkcpnyjrvf.public.blob.vercel-storage.com/scripts/renamed_script.py",
    "owner": 1,
    "owner_username": "john_doe",
    "content_type": "text/x-python",
    "file_size": 30,
    "uploaded_at": "2026-02-03T10:30:00Z",
    "updated_at": "2026-02-03T10:40:00Z",
    "version": 2
  },
  "errors": null
}
```

---

### 7. Delete Script

**DELETE** `/api/scripts/<id>/`

Deletes a script from both the database and Vercel Blob storage.

**Success Response (200):**

```json
{
  "success": true,
  "message": "Script 'my_script' deleted successfully.",
  "data": null,
  "errors": null
}
```

---

## Error Responses

### 400 Bad Request

Validation errors or invalid input.

```json
{
  "success": false,
  "message": "Validation failed.",
  "data": null,
  "errors": {
    "field_name": ["Error message"]
  }
}
```

### 404 Not Found

Script not found or user doesn't have permission.

```json
{
  "success": false,
  "message": "Not found.",
  "data": null,
  "errors": null
}
```

### 500 Internal Server Error

Server or blob storage errors.

```json
{
  "success": false,
  "message": "An unexpected error occurred.",
  "data": null,
  "errors": {
    "server": ["Error details"]
  }
}
```

---

## Features

### ✅ Implemented

- **CRUD Operations**: Create, Read, Update, Delete scripts
- **Vercel Blob Integration**: Automatic file upload/download/delete
- **Version Control**: Automatic version incrementing on updates
- **Input Validation**: Comprehensive validation for all inputs
- **Error Handling**: Detailed error messages and proper HTTP status codes
- **Ownership Control**: Users can only access their own scripts
- **Language Support**: 20+ programming languages supported
- **Rename Functionality**: Rename scripts with automatic blob migration

### 🔒 Security

- Authentication required for all endpoints
- Owner-based access control
- Input sanitization and validation
- Secure blob storage integration

### 📝 Response Format

All responses follow a consistent format:

```json
{
  "success": boolean,
  "message": string,
  "data": object | array | null,
  "errors": object | null
}
```
