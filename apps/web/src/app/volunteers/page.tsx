const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getVolunteers() {
  try {
    const res = await fetch(`${API}/api/volunteers`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function VolunteersPage() {
  const volunteers = await getVolunteers();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Wolontariusze</h1>
        <span className="text-gray-500">{volunteers.length} osób</span>
      </div>

      {volunteers.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-5xl mb-4">👤</div>
          <p>Brak zarejestrowanych wolontariuszy.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {volunteers.map((v: any) => (
            <div key={v.id} className="bg-white rounded-xl shadow-sm p-5 border">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-semibold text-gray-900">{v.name}</h2>
                  <p className="text-gray-500 text-sm">{v.email}</p>
                  {v.location && <p className="text-gray-500 text-sm">📍 {v.location}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  v.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  v.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {v.status}
                </span>
              </div>
              {v.bio && <p className="text-gray-600 text-sm mt-2">{v.bio}</p>}
              {v.skills?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {v.skills.map((skill: string) => (
                    <span key={skill} className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
