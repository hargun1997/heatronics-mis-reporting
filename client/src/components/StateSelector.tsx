import React from 'react';
import { IndianState, INDIAN_STATES } from '../types';

interface StateSelectorProps {
  selectedStates: IndianState[];
  onStateToggle: (state: IndianState) => void;
  activeState: IndianState | null;
  onActiveStateChange: (state: IndianState | null) => void;
}

export function StateSelector({
  selectedStates,
  onStateToggle,
  activeState,
  onActiveStateChange
}: StateSelectorProps) {
  // UP is mandatory - check if it's selected
  const isUPSelected = selectedStates.includes('UP');

  const handleStateToggle = (code: IndianState) => {
    // Prevent deselecting UP if it's the only way to have multi-state mode
    if (code === 'UP' && isUPSelected && selectedStates.length === 1) {
      // Allow deselecting UP only if it will exit multi-state mode entirely
      onStateToggle(code);
      return;
    }

    // If selecting any state and UP is not selected, auto-select UP first
    if (!isUPSelected && code !== 'UP') {
      onStateToggle('UP');
    }

    onStateToggle(code);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* State Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select States <span className="text-gray-500">(UP is mandatory)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {INDIAN_STATES.map(({ code, name }) => {
            const isSelected = selectedStates.includes(code);
            const isMandatory = code === 'UP';
            const isDisabled = isMandatory && isUPSelected && selectedStates.length > 1;

            return (
              <button
                key={code}
                onClick={() => handleStateToggle(code)}
                disabled={isDisabled}
                className={`
                  px-3 py-1.5 rounded-full text-sm font-medium transition-all
                  ${isSelected
                    ? isMandatory
                      ? 'bg-green-100 text-green-800 border-2 border-green-400'
                      : 'bg-blue-100 text-blue-800 border-2 border-blue-400'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                  }
                  ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}
                `}
                title={isDisabled ? 'UP is mandatory and cannot be deselected' : undefined}
              >
                {isSelected && (
                  <svg className="inline-block w-4 h-4 mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {name}
                {isMandatory && <span className="ml-1 text-xs">(Required)</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active State Tabs */}
      {selectedStates.length > 0 && (
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-4" aria-label="States">
            {selectedStates.map((stateCode) => {
              const state = INDIAN_STATES.find(s => s.code === stateCode);
              const isActive = activeState === stateCode;
              return (
                <button
                  key={stateCode}
                  onClick={() => onActiveStateChange(stateCode)}
                  className={`
                    py-2 px-4 border-b-2 font-medium text-sm transition-colors
                    ${isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {state?.name || stateCode}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

interface StateFileSummaryProps {
  selectedStates: IndianState[];
  getStateFileStatus: (state: IndianState) => {
    balanceSheet: boolean;
    journal: boolean;
    purchase: boolean;
    sales: boolean;
  };
}

export function StateFileSummary({
  selectedStates,
  getStateFileStatus
}: StateFileSummaryProps) {
  if (selectedStates.length === 0) return null;

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
      <h4 className="text-sm font-medium text-gray-700 mb-2">File Upload Status by State</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {selectedStates.map((stateCode) => {
          const state = INDIAN_STATES.find(s => s.code === stateCode);
          const status = getStateFileStatus(stateCode);
          const uploadedCount = [status.balanceSheet, status.journal, status.purchase, status.sales].filter(Boolean).length;

          return (
            <div
              key={stateCode}
              className="flex items-center justify-between p-2 bg-white rounded border border-gray-200"
            >
              <span className="text-sm font-medium text-gray-700">{state?.name}</span>
              <div className="flex items-center gap-1">
                <span className={`text-xs ${uploadedCount === 4 ? 'text-green-600' : 'text-gray-500'}`}>
                  {uploadedCount}/4 files
                </span>
                {uploadedCount === 4 && (
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
