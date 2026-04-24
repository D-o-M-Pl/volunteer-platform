import Anthropic from '@anthropic-ai/sdk';
import type { Task, Volunteer } from '@volunteer/database';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface VolunteerMatch {
  volunteerId: string;
  name: string;
  email: string;
  matchScore: number;
  matchReason: string;
}

export async function matchVolunteersToTask(
  task: Task,
  volunteers: Volunteer[],
  limit: number,
): Promise<VolunteerMatch[]> {
  const prompt = `Jesteś systemem dopasowywania wolontariuszy do zadań wolontariackich.

Zadanie:
- Tytuł: ${task.title}
- Opis: ${task.description}
- Wymagane umiejętności: ${task.requiredSkills.join(', ') || 'brak wymagań'}
- Lokalizacja: ${task.location ?? 'dowolna'}

Wolontariusze (aktywni):
${volunteers.map((v, i) => `${i + 1}. ID: ${v.id} | Imię: ${v.name} | Umiejętności: ${v.skills.join(', ') || 'brak'} | Lokalizacja: ${v.location ?? 'nieokreślona'}`).join('\n')}

Oceń dopasowanie każdego wolontariusza do zadania (0-100) i wybierz najlepszych ${limit}.
Uwzględnij: zgodność umiejętności, lokalizację, opis zadania.

Odpowiedz TYLKO w formacie JSON (bez markdown, bez tekstu przed/po):
{
  "matches": [
    {
      "volunteerId": "uuid-tutaj",
      "matchScore": 85,
      "matchReason": "Krótkie uzasadnienie po polsku (1-2 zdania)"
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') return [];

  const parsed = JSON.parse(content.text) as {
    matches: Array<{ volunteerId: string; matchScore: number; matchReason: string }>;
  };

  return parsed.matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)
    .map((match) => {
      const volunteer = volunteers.find((v) => v.id === match.volunteerId);
      return {
        volunteerId: match.volunteerId,
        name: volunteer?.name ?? 'Nieznany',
        email: volunteer?.email ?? '',
        matchScore: match.matchScore,
        matchReason: match.matchReason,
      };
    });
}
