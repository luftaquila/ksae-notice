'use client';

interface CategoryFilterProps {
  categories: { id: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const allSelected = selected.length === 0;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => onChange([])}
        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
          allSelected
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        전체
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => toggle(cat.id)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
            selected.includes(cat.id)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
