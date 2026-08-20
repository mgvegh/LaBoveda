async function t() {
  const start = Date.now();
  const res = await fetch('https://laboveda.vercel.app/api/mcp/clases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alumno: 'Lucas Gomez',
      materia: 'Analisis Matematico',
      fecha: '2026-08-25',
      hora_inicio: '18:30',
      duracion_minutos: 120,
      modalidad: 'presencial',
      tipo: 'CET'
    })
  });
  console.log('Status:', res.status, 'Time ms:', Date.now() - start);
  const data = await res.json();
  console.log('Result:', data);
}
t();
