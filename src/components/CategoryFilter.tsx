'use client';

interface CategoryFilterProps {
  categories: { id: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const CATEGORY_COLORS: Record<string, { active: string; inactive: string }> = {
  '공통': { active: 'bg-gray-600 text-white', inactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  'Baja': { active: 'bg-orange-500 text-white', inactive: 'bg-orange-50 text-orange-600 hover:bg-orange-100' },
  'Formula': { active: 'bg-blue-600 text-white', inactive: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
  'EV': { active: 'bg-purple-600 text-white', inactive: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
  '자율주행': { active: 'bg-rose-500 text-white', inactive: 'bg-rose-50 text-rose-500 hover:bg-rose-100' },
  '규정': { active: 'bg-green-600 text-white', inactive: 'bg-green-50 text-green-600 hover:bg-green-100' },
};

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
      {categories.map((cat) => {
        const colors = CATEGORY_COLORS[cat.label] || { active: 'bg-blue-600 text-white', inactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200' };
        return (
          <button
            key={cat.id}
            onClick={() => toggle(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
              selected.includes(cat.id) ? colors.active : colors.inactive
            }`}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
