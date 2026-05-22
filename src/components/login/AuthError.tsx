'use client';

// AuthError — a presentational, ARIA-live error card shown above/below the
// login form. Rendered conditionally by LoginScreen.

interface Props {
  message: string;
}

export function AuthError({ message }: Props) {
  return (
    <div
      role="alert"
      className="login__error"
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--color-danger, #d04646)',
        background: 'color-mix(in srgb, var(--color-danger, #d04646) 8%, transparent)',
        color: 'var(--color-danger, #d04646)',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  );
}
