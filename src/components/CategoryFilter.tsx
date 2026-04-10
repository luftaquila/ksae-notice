'use client';

import { CATEGORY_COLORS } from '@/lib/constants';

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
        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          allSelected
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-700'
        }`}
      >
        전체
      </button>
      {categories.map((cat) => {
        const colors = CATEGORY_COLORS[cat.label];
        const active = colors?.filterActive || 'bg-blue-600 text-white';
        const inactive = colors?.filterInactive || 'bg-gray-100 text-gray-600 hover:bg-gray-200';
        return (
          <button
            key={cat.id}
            onClick={() => toggle(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
              selected.includes(cat.id) ? active : inactive
            }`}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
