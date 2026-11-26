export default function Avatar({ look }) {
  return (
    <span className="avatar" data-color={look?.color ?? 'teal'} aria-hidden="true">
      {look?.avatar ?? '🙂'}
    </span>
  );
}
