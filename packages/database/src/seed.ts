import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const org = await db.organization.upsert({
    where: { contactEmail: 'kontakt@wolontariat.pl' },
    update: {},
    create: {
      name: 'Fundacja Wolontariat PL',
      description: 'Organizacja łącząca wolontariuszy z potrzebującymi.',
      location: 'Warszawa',
      contactEmail: 'kontakt@wolontariat.pl',
    },
  });

  await db.task.createMany({
    skipDuplicates: true,
    data: [
      {
        organizationId: org.id,
        title: 'Pomoc przy organizacji zbiórki żywności',
        description: 'Szukamy wolontariuszy do sortowania i wydawania żywności potrzebującym rodzinom.',
        requiredSkills: ['komunikatywność', 'praca fizyczna', 'organizacja'],
        location: 'Warszawa',
        maxVolunteers: 10,
        status: 'OPEN',
      },
      {
        organizationId: org.id,
        title: 'Korepetycje z matematyki dla dzieci',
        description: 'Udzielamy korepetycji dzieciom z rodzin w trudnej sytuacji materialnej. Wymagana znajomość matematyki na poziomie szkoły średniej.',
        requiredSkills: ['matematyka', 'cierpliwość', 'pedagogika'],
        location: 'Kraków',
        maxVolunteers: 5,
        status: 'OPEN',
      },
      {
        organizationId: org.id,
        title: 'Wsparcie techniczne dla seniorów',
        description: 'Pomagamy seniorom obsługiwać komputery, smartfony i internet.',
        requiredSkills: ['IT', 'cierpliwość', 'komunikatywność'],
        location: 'Gdańsk',
        maxVolunteers: 8,
        status: 'OPEN',
      },
    ],
  });

  console.log('✅ Seed zakończony pomyślnie');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
