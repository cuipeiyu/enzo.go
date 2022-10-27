import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import { terser } from 'rollup-plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const name = 'index';

const bundle = config => ({
  ...config,
  input: 'src/index.ts',
  external: id => !/^[./]/.test(id),
});

export default [
  bundle({
    plugins: [nodeResolve(), esbuild()],
    output: [
      {
        file: `dist/${name}.js`,
        format: 'umd',
        name: 'enzo',
        global: {
          'eventemitter3': 'eventemitter3',
          'minimatch': 'minimatch',
        },
        sourcemap: true,
      },
      {
        file: `dist/${name}.min.js`,
        format: 'umd',
        name: 'enzo',
        global: {
          'eventemitter3': 'eventemitter3',
          'minimatch': 'minimatch',
        },
        sourcemap: true,
        plugins: [terser()],
      },
      {
        file: `dist/${name}.mjs`,
        format: 'es',
        sourcemap: true,
      },
    ],
  }),
  bundle({
    plugins: [dts()],
    output: {
      file: `dist/${name}.d.ts`,
      format: 'es',
    },
  }),
];
