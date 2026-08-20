# Guía de Renovación de Claves, Seguridad y Blindaje (La Bóveda)

Esta guía detalla los pasos exactos para renovar y proteger las credenciales de tu proyecto.

---

## 1. Estado Actual de Seguridad en el Repositorio

- **`.gitignore`**: El archivo `.gitignore` ya excluye `.env*`, evitando que cualquier archivo con secretos se suba a Git.
- **`.env.example`**: Se ha creado un archivo modelo con los nombres de variables sin valores sensibles.
- **Limpieza de dependencias**: Se desinstalaron `@supabase/ssr` y `@supabase/supabase-js`, reduciendo la superficie de dependencias y eliminando rastros huérfanos.

---

## 2. Cómo Renovar y Restringir las Claves de Firebase

Las claves de Firebase (`NEXT_PUBLIC_FIREBASE_API_KEY`) son públicas en el frontend por diseño de Firebase. Sin embargo, para garantizar que **nadie más pueda usarlas fuera de tu aplicación**, sigue estos pasos:

### Paso 1: Regenerar o Restringir la API Key en Google Cloud Console
1. Entrá a [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials).
2. Seleccioná el proyecto de Firebase (`laboveda-b3a1b`).
3. En la sección **API Keys** (Claves de API):
   - Si deseás rotarla: podés crear una nueva clave con **Create Credentials** -> **API Key** y luego borrar la anterior.
   - Hacé clic en la clave actual (o la nueva) para editarla.

### Paso 2: Configurar Restricciones de Aplicación (HTTP Referrers)
Para evitar que alguien use tu clave desde otro sitio web o script:
1. En **Application restrictions**, seleccioná **Websites** (Sitios web / Referrers HTTP).
2. Agregá tus dominios autorizados:
   - `http://localhost:*` (para desarrollo local)
   - `http://127.0.0.1:*` (para desarrollo local)
   - `https://*.vercel.app/*` (para Vercel)
   - `https://tudominio.com/*` (si tenés dominio propio)
3. En **API restrictions**, podés limitar la clave a:
   - *Identity Toolkit API* (Firebase Auth)
   - *Cloud Firestore API* (Base de datos)
   - *Firebase Installations API*
4. Guardá los cambios (**Save**).

---

## 3. Auditoría de Reglas de Seguridad de Firestore

Asegurate de que tus reglas de Firestore en la consola de Firebase (`Firestore Database` -> `Rules`) protejan los datos por usuario autenticado:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Cada usuario solo puede leer y escribir sus propios datos
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Solicitudes / mensajes de contacto
    match /user_requests/{requestId} {
      allow create: if request.auth != null;
      allow read, update, delete: if request.auth != null && request.auth.token.email == "tu_email_admin@ejemplo.com";
    }
  }
}
```

---

## 4. Actualización de `.env.local`

Una vez que tengas tus nuevas claves o valores actualizados, configuralos en tu archivo local `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=tu_nueva_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=laboveda-b3a1b.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=laboveda-b3a1b
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=laboveda-b3a1b.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=453805322605
NEXT_PUBLIC_FIREBASE_APP_ID=1:453805322605:web:f88cae0fbe4915f97d2a64
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-43V9V52DMB
```
