export default function HomePage() {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Platforma Wolontariatu z AI
      </h1>
      <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
        Łączymy wolontariuszy z organizacjami. Claude AI dobiera najlepsze dopasowania
        na podstawie umiejętności i lokalizacji.
      </p>
      <div className="flex gap-4 justify-center">
        <a
          href="/tasks"
          className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          Przeglądaj zadania
        </a>
        <a
          href="/volunteers"
          className="border border-green-600 text-green-600 px-6 py-3 rounded-lg font-medium hover:bg-green-50 transition-colors"
        >
          Zostań wolontariuszem
        </a>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <div className="text-3xl mb-3">🤖</div>
          <h3 className="font-semibold text-lg mb-2">Dopasowanie AI</h3>
          <p className="text-gray-600">Claude AI analizuje umiejętności wolontariuszy i dobiera ich do odpowiednich zadań.</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <div className="text-3xl mb-3">🏢</div>
          <h3 className="font-semibold text-lg mb-2">Dla organizacji</h3>
          <p className="text-gray-600">NGO i fundacje publikują zadania i zarządzają wolontariuszami w jednym miejscu.</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <div className="text-3xl mb-3">📋</div>
          <h3 className="font-semibold text-lg mb-2">Transparentność</h3>
          <p className="text-gray-600">Pełna historia zgłoszeń, statusów i działań wolontariackich.</p>
        </div>
      </div>
    </div>
  );
}
