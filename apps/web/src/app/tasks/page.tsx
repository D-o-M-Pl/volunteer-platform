const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getTasks() {
  try {
    const res = await fetch(`${API}/api/tasks?status=OPEN`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function TasksPage() {
  const tasks = await getTasks();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dostępne zadania</h1>
        <span className="text-gray-500">{tasks.length} zadań</span>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-5xl mb-4">📋</div>
          <p>Brak dostępnych zadań. Sprawdź ponownie później.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task: any) => (
            <div key={task.id} className="bg-white rounded-xl shadow-sm p-6 border hover:border-green-300 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{task.title}</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    🏢 {task.organization?.name}
                    {task.location && <span> · 📍 {task.location}</span>}
                  </p>
                </div>
                <span className="bg-green-100 text-green-700 text-sm px-3 py-1 rounded-full whitespace-nowrap">
                  {task.maxVolunteers} miejsc
                </span>
              </div>

              <p className="text-gray-600 mt-3">{task.description}</p>

              {task.requiredSkills?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {task.requiredSkills.map((skill: string) => (
                    <span key={skill} className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded">
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
