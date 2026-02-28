export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-dark-900">Profile</h1>
        <p className="mt-2 text-dark-400">ID: {id} — coming in Phase 0B</p>
      </div>
    </div>
  );
}
