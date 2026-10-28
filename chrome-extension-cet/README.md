# Extensión CET & La Bóveda - Comparador Inteligente de Clases

Extensión de Google Chrome para cruzar y conciliar en tiempo real las clases del **Panel docente de CET** (`https://cet.com.ar/docente/clases`) con las clases registradas en **La Bóveda** (`https://laboveda.vercel.app/clases`).

---

## 🚀 Cómo instalar la extensión en Google Chrome (en 30 segundos)

1. Abrí Google Chrome y andá a:
   ```
   chrome://extensions/
   ```
2. Arriba a la derecha, activá la casilla **"Modo de desarrollador"** (Developer mode).
3. Arriba a la izquierda, hacé clic en el botón **"Cargar descomprimida"** (Load unpacked).
4. Seleccioná la carpeta de la extensión:
   ```
   c:\Users\veghm\.gemini\antigravity\scratch\investment-tracker\chrome-extension-cet
   ```
5. ¡Listo! La extensión ya estará activa y visible en tus extensiones de Chrome.

---

## 🎯 Cómo funciona

1. **Abrí La Bóveda:** En una pestaña, abrí `https://laboveda.vercel.app/clases`.
2. **Abrí CET:** En otra pestaña, abrí `https://cet.com.ar/docente/clases`.
3. En la página de CET vas a ver una **barra flotante arriba a la derecha** (`⚡ La Bóveda`) que te indica el estado de conexión y los contadores en tiempo real.
4. Cada tarjeta de clase en CET se resaltará automáticamente:
   - 🟢 **Verde (`✔ En La Bóveda`):** Coincide fecha, hora y alumno (incluso si en La Bóveda tenés solo el nombre de pila como *"Violeta"* y en CET figura *"Violeta Corona"*).
   - 🟡 **Amarillo (`⚠️ Diferencia de horario`):** El alumno coincide en esa fecha, pero hay diferencia en el horario de inicio o duración.
   - 🔴 **Rojo (`✕ No está en La Bóveda`):** La clase no está registrada en La Bóveda.
5. **Detección de clases ausentes en CET:**  
   Si en La Bóveda tenés cargada una clase para esas fechas pero en CET no figura, la barra flotante te mostrará un aviso:  
   `⚠️ X clases en La Bóveda no figuran en CET`  
   Haciendo clic podés ver el detalle para saber si CET omitió registrar alguna clase pasada o futura.
