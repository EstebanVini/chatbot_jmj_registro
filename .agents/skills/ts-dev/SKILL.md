---
name: ts-dev
description: Expert TypeScript configuration and development skill.
---

# TypeScript Development Skill

Use this skill to configure and enforce robust TypeScript usage.

## Guidelines

1. **Strict Mode**: Ensure `strict: true` is enabled in `tsconfig.json`.
2. **Type Inference**: Let TypeScript infer types when obvious. Do not over-annotate.
3. **Interfaces vs Types**: Use `interface` for object shapes and class structures, and `type` for unions, intersections, and primitives.
4. **Generics**: Use Generics (`<T>`) to build reusable components and functions safely.
5. **Enums vs Unions**: Prefer union types (`'A' | 'B'`) over enums for simple sets of strings, as they are cleaner in JavaScript transpilation.
6. **Utility Types**: Leverage built-in utility types like `Partial`, `Omit`, `Pick`, and `Record`.
7. **Type Guards**: Implement custom type guards (using `is` keyword) when dealing with complex narrowed types.
