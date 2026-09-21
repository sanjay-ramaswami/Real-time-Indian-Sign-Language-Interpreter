import Interpreter from "./pages/Interpreter";

function App() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      <header className="px-6 md:px-14 pt-10 pb-2 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-[#0F172A]">
          ISL Translator
        </h1>
        <p className="mt-2 font-medium text-[14.5px] text-[#14B8A6]">
          Indian Sign Language → Malayalam
        </p>
      </header>

      <main className="flex-1">
        <Interpreter />
      </main>

      <footer className="px-6 py-6 text-center">
        <p className="text-[13px] font-medium text-[#64748B]">
          Indian Sign Language → Malayalam
        </p>
      </footer>
    </div>
  );
}

export default App;