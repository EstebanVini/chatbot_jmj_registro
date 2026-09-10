# Project Rules & Workflows

## Web Development Best Practices

This project uses Node.js, React.js, and TypeScript. You should automatically leverage the following skills when working on related files:
- `react-dev` when working on frontend UI and React components.
- `node-dev` when working on backend API and Node.js logic.
- `ts-dev` when dealing with typing, interfaces, and `tsconfig.json`.

## Code Quality

- Always enforce the `ponytail` skill. We prioritize clean, robust, and maintainable code.
- Always check types and linting before finishing a task.
- Be proactive in refactoring messy code if you encounter it while making changes.

## Subagents for Efficiency
When faced with complex tasks (e.g. implementing a full full-stack feature), consider invoking specialized subagents (using `invoke_subagent` with specific roles like 'Frontend Engineer' or 'Backend Engineer') to parallelize the work and maintain a clean context.
