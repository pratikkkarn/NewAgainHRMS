import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Check, X, Users, Star } from 'lucide-react';
import { EmployeeProfile, AssignedEmployee } from '../../types/domain';

export interface SearchableEmployeeSelectorProps {
  allEmployees: EmployeeProfile[];
  poEmployees?: AssignedEmployee[];
  selectedEmployeeIds: string[];
  onChange: (employeeIds: string[]) => void;
  placeholder?: string;
  isCreditNote?: boolean;
}

export const SearchableEmployeeSelector: React.FC<SearchableEmployeeSelectorProps> = ({
  allEmployees,
  poEmployees = [],
  selectedEmployeeIds,
  onChange,
  placeholder = '-- Select or Search Employee --',
  isCreditNote = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  // Combine & filter candidates
  const filteredList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // Map all employees into unified representation
    const items: Array<{
      id: string;
      name: string;
      designation: string;
      isPoTagged: boolean;
    }> = [];

    // First collect PO tagged employees
    const poTaggedIds = new Set<string>();
    poEmployees.forEach((pe) => {
      poTaggedIds.add(pe.employeeId);
      items.push({
        id: pe.employeeId,
        name: pe.employeeName,
        designation: pe.designation,
        isPoTagged: true,
      });
    });

    // Then add other company employees
    allEmployees.forEach((emp) => {
      if (!poTaggedIds.has(emp.employeeId)) {
        items.push({
          id: emp.employeeId,
          name: emp.name,
          designation: emp.designation,
          isPoTagged: false,
        });
      }
    });

    // Apply search filter
    if (!query) return items;

    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.designation.toLowerCase().includes(query)
    );
  }, [allEmployees, poEmployees, searchQuery]);

  // Handle selection toggling
  const handleToggleSelect = (empId: string) => {
    if (selectedEmployeeIds.includes(empId)) {
      onChange(selectedEmployeeIds.filter((id) => id !== empId));
    } else {
      onChange([...selectedEmployeeIds, empId]);
    }
    // Reset search on selection for convenient next pick
    setSearchQuery('');
  };

  const handleRemoveBadge = (empId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedEmployeeIds.filter((id) => id !== empId));
  };

  // Keyboard navigation inside popover
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredList.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredList.length - 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList.length > 0 && filteredList[highlightedIndex]) {
        handleToggleSelect(filteredList[highlightedIndex].id);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full text-xs" onKeyDown={handleKeyDown}>
      {/* DROPDOWN TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 flex items-center justify-between hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-colors cursor-pointer shadow-2xs"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate text-slate-700">
          {selectedEmployeeIds.length > 0 ? (
            <span className="font-semibold text-slate-900">
              {selectedEmployeeIds.length} employee{selectedEmployeeIds.length > 1 ? 's' : ''} selected
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* SEARCHABLE POPOVER DROPDOWN MENU */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-72">
          {/* SEARCH INPUT BAR */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder="Search by name or employee ID (e.g. Rajesh, PS-001)..."
              className="w-full bg-white px-2 py-1.5 border border-slate-200 rounded-md text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-200 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* OPTIONS SCROLLABLE LIST */}
          <div className="overflow-y-auto p-1 space-y-0.5 max-h-56">
            {filteredList.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs font-medium">
                No employees found matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredList.map((emp, index) => {
                const isSelected = selectedEmployeeIds.includes(emp.id);
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleToggleSelect(emp.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-900 font-semibold'
                        : isHighlighted
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {emp.isPoTagged && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> PO Tagged
                        </span>
                      )}
                      <span className="truncate">
                        <strong className="text-slate-900">{emp.name}</strong>{' '}
                        <span className="text-slate-500">({emp.designation})</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {emp.id}
                      </span>
                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SELECTED BADGES DISPLAY AREA */}
      {selectedEmployeeIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
          {selectedEmployeeIds.map((id) => {
            const empObj =
              allEmployees.find((e) => e.employeeId === id) ||
              poEmployees.find((e) => e.employeeId === id);
            const displayName = empObj
              ? 'name' in empObj
                ? empObj.name
                : empObj.employeeName
              : id;

            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-md text-xs font-semibold shadow-2xs"
              >
                <span>
                  {displayName} <span className="font-mono font-normal text-blue-600">({id})</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveBadge(id, e)}
                  className="text-blue-500 hover:text-blue-900 rounded-full hover:bg-blue-100 p-0.5 transition-colors cursor-pointer"
                  title={`Remove ${displayName}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
