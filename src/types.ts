// src/types.ts
export interface RecommendedExtension {
    id: string;
    name?: string; // Name is optional, can be fetched or user-provided
}

export interface KeySetting {
    key: string;
    value: any;
    description?: string; // Optional description for display
}

export interface WorkspaceProfile {
    id: string; // Unique identifier (e.g., "javascript-frontend")
    name: string; // User-friendly name (e.g., "JavaScript Frontend Project")
    description?: string;
    recommendedExtensions: RecommendedExtension[];
    keySettingsSnippet: KeySetting[]; // Store as an array of KeySetting objects
    isUserDefined?: boolean; // Flag to distinguish built-in from user-created
}

// Example Built-in Profiles (Expand this list)
export const DEFAULT_PROFILES: WorkspaceProfile[] = [
    {
        id: "javascript-frontend-react",
        name: "JavaScript Frontend (React)",
        description: "Sets up a React frontend environment with ESLint, Prettier.",
        recommendedExtensions: [
            { id: "dbaeumer.vscode-eslint", name: "ESLint" },
            { id: "esbenp.prettier-vscode", name: "Prettier - Code formatter" },
            { id: "msjsdiag.debugger-for-chrome", name: "Debugger for Chrome" }
        ],
        keySettingsSnippet: [
            { key: "editor.formatOnSave", value: true, description: "Enable format on save" },
            { key: "editor.defaultFormatter", value: "esbenp.prettier-vscode", description: "Set Prettier as default" },
            { key: "files.eol", value: "\n", description: "Ensure LF line endings" },
            {
                key: "[javascript][javascriptreact][typescript][typescriptreact]",
                value: {
                    "editor.defaultFormatter": "esbenp.prettier-vscode"
                },
                description: "Default formatter for JS/TS files"
            }
        ],
        isUserDefined: false, // Crucial: Mark built-in profiles
    },
    {
        id: "python-backend-django",
        name: "Python Backend (Django)",
        description: "Configures a Python Django backend environment. (Requires Python extension)",
        recommendedExtensions: [
            { id: "ms-python.python", name: "Python" },
            { id: "ms-python.vscode-pylance", name: "Pylance" },
            { id: "batisteo.vscode-django", name: "Django" }
        ],
        keySettingsSnippet: [
            { key: "python.linting.pylintEnabled", value: false, description: "Disable Pylint if using Flake8 or other" },
            { key: "python.linting.flake8Enabled", value: true, description: "Enable Flake8 linter" },
            { key: "python.formatting.provider", value: "black", description: "Use Black formatter" },
            { key: "editor.formatOnSave", value: true, description: "Enable format on save for Python" },
            {
                key: "[python]",
                value: {
                    "editor.defaultFormatter": "ms-python.black-formatter" // Or ms-python.autopep8
                },
                description: "Default formatter for Python files"
            }
        ],
        isUserDefined: false, // Crucial: Mark built-in profiles
    },
];