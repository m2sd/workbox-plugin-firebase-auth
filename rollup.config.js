/* eslint-disable */
import { join } from 'path'
import typescript from '@rollup/plugin-typescript'
import stripBanner from 'rollup-plugin-strip-banner'
import license from 'rollup-plugin-license'
import { terser } from 'rollup-plugin-terser'

const commonPlugins = plugins => {
  plugins.push(stripBanner())
  plugins.push(
    license({
      banner: {
        commentStyle: 'ignored',
        content: {
          file: join(__dirname, 'LICENSE'),
        },
      },
    })
  )

  if (process.env.NODE_ENV !== 'development') {
    plugins.push(
      terser({
        output: {
          comments: (_node, comment) => {
            console.log(comment.value)
            return comment.type === 'comment2' && /^!/.test(comment.value)
          },
        },
      })
    )
  }

  return plugins
}

export default [
  {
    input: 'src/plugin.ts',
    output: {
      file: 'lib/plugin.umd.js',
      name: 'WorkboxPluginFirebaseAuth',
      format: 'iife',
    },
    plugins: commonPlugins([typescript()]),
  },
  {
    input: 'src/plugin.ts',
    output: {
      dir: 'lib',
      format: 'module',
    },
    plugins: commonPlugins([
      typescript({
        rootDir: './src/',
        outDir: './lib/',
        declaration: true,
      }),
    ]),
  },
]
/* eslint-enable */
