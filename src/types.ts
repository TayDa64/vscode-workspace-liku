// src/types.ts
export interface RecommendedExtension {
    id: string; // e.g., "dbaeumer.vscode-eslint"
    name: string; // e.g., "ESLint"
}

export interface KeySetting {
    key: string; // e.g., "editor.formatOnSave"
    value: any;
    description?: string; // Optional description
}

export interface WorkspaceProfile {
    id: string; // e.g., "javascript-frontend"
    name: string; // e.g., "JavaScript Frontend Project"
    description?: string;
    recommendedExtensions: RecommendedExtension[];
    keySettingsSnippet: KeySetting[];
}

// Example Data (you'll expand this based on vscode-workspace-starter-1)
export const DEFAULT_PROFILES: WorkspaceProfile[] = [
    {
        id: "javascript-frontend",
        name: "JavaScript Frontend (React/Vue/Angular)",
        description: "Sets up a typical JavaScript frontend environment.",
        recommendedExtensions: [
            { id: "dbaeumer.vscode-eslint", name: "ESLint" },
            { id: "esbenp.prettier-vscode", name: "Prettier - Code formatter" },
            { id: "Vue.volar", name: "Vue Language Features (Volar)" }, // Example
        ],
        keySettingsSnippet: [
            { key: "editor.formatOnSave", value: true, description: "Enable format on save" },
            { key: "editor.defaultFormatter", value: "esbenp.prettier-vscode", description: "Set Prettier as default formatter" },
            { key: "files.eol", value: "\n", description: "Ensure LF line endings" },
            {
                key: "[javascript][typescript][json][html][css][scss]",
                value: {
                    "editor.defaultFormatter": "esbenp.prettier-vscode"
                }
            }
        ],
    },
    {
        id: "python-backend",
        name: "Python Backend (Flask/Django)",
        description: "Configures a Python backend development environment.",
        recommendedExtensions: [
            { id: "ms-python.python", name: "Python" },
            { id: "ms-python.vscode-pylance", name: "Pylance" },
        ],
        keySettingsSnippet: [
            { key: "python.linting.pylintEnabled", value: true },
            { key: "python.formatting.provider", value: "black" }, // or autopep8
            { key: "editor.formatOnSave", value: true, description: "Enable format on save for Python" },
        ],
    },
    // Add more profiles here
];