const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getOrganizations() {
  try {
    const res = await fetch(`${API}/api/organizations`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Organizacje</h1>

      {organizations.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-5xl mb-4">🏢</div>
          <p>Brak zarejestrowanych organizacji.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {organizations.map((org: any) => (
            <div key={org.id} className="bg-white rounded-xl shadow-sm p-6 border">
              <h2 className="text-xl font-semibold text-gray-900">{org.name}</h2>
              {org.location && <p className="text-gray-500 text-sm mt-1">📍 {org.location}</p>}
              {org.description && <p className="text-gray-600 mt-2">{org.description}</p>}
              <p className="text-gray-400 text-sm mt-3">✉️ {org.contactEmail}</p>
              {org.tasks && (
                <p className="text-green-600 text-sm mt-2">
                  {org.tasks.length} zadań opublikowanych
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
