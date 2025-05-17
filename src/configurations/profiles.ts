export interface ConfigFile {
    path: string; // e.g., ".vscode/tasks.json" or ".prettierrc.js"
    content: string;
}

export interface ConfigProfile {
    id: string;
    name: string;
    description: string;
    icon: string; // Codicon ID like "globe", "code", "shield"
    settings: { [key: string]: any };
    extensions: string[];
    files?: ConfigFile[];
}

export const PROFILES: ConfigProfile[] = [
    {
        id: "general-safe",
        name: "General Safe Workspace",
        description: "A basic, safe configuration for any project.",
        icon: "shield",
        settings: {
            "editor.formatOnSave": true,
            "files.eol": "\n",
            "editor.wordWrap": "on",
            "security.workspace.trust.enabled": true,
            "security.workspace.trust.startupPrompt": "always"
        },
        extensions: [
            "streetsidesoftware.code-spell-checker",
            "gruntfuggly.todo-tree"
        ],
        files: [
            {
                path: ".editorconfig",
                content: "root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ncharset = utf-8\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n"
            }
        ]
    },
    {
        id: "web-frontend",
        name: "Web Frontend (React/Vue)",
        description: "Configuration for modern frontend development with linters and formatters.",
        icon: "globe",
        settings: {
            "editor.formatOnSave": true,
            "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact", "vue"],
            "editor.codeActionsOnSave": {
                "source.fixAll.eslint": "explicit" // "explicit" is better than true/false
            }
        },
        extensions: [
            "dbaeumer.vscode-eslint",
            "esbenp.prettier-vscode",
            "vue.volar" // Example
        ],
        files: [
             {
                path: ".eslintrc.json",
                content: JSON.stringify({
                    "extends": ["eslint:recommended"],
                    "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" }, // Updated ecmaVersion
                    "env": { "browser": true, "node": true, "es2022": true } // Updated env
                }, null, 2)
            },
            {
                path: ".prettierrc.json",
                content: JSON.stringify({ "semi": true, "singleQuote": true, "tabWidth": 2 }, null, 2)
            }
        ]
    }
    // Add more profiles
];