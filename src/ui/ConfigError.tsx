export function ConfigError({ message }: { message: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div style={{
        maxWidth: 480, padding: 24, borderRadius: 12,
        background: '#111823', border: '1px solid #263041',
      }}>
        <h1 style={{ margin: '0 0 10px', fontSize: 17 }}>Картограф не настроен</h1>
        <p style={{ margin: '0 0 14px', fontSize: 14, opacity: .8, lineHeight: 1.5 }}>
          Не хватает переменной окружения. Заполните её в <code>.env.local</code> локально
          или в настройках проекта Vercel и пересоберите.
        </p>
        <code style={{
          display: 'block', padding: '10px 12px', borderRadius: 8,
          background: '#0d1117', border: '1px solid #263041', fontSize: 13, color: '#ff9aa2',
        }}>
          {message}
        </code>
      </div>
    </div>
  );
}
