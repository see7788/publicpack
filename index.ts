import electronBuilderMode from "electron-builder";
import fs from 'fs-extra'
import util from "util";
import path from "path";
import cp from "child_process";
import minimist from "minimist";
import merge from "webpack-merge";
import webpack from "webpack";
// import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import { TsconfigPathsPlugin } from "tsconfig-paths-webpack-plugin";
import copywebpackplugin from 'copy-webpack-plugin';
export const copyPlugin = (...fileOp: {
  entry: string, output: { path: string, filename: string }
}[]) => new copywebpackplugin({
  patterns: fileOp.map(({ entry, output }) => ({
    from: entry,
    to: path.join(output.path, output.filename)
  }))
})
export const loader = {
  ts: {
    test: /\.(js|jsx|ts|tsx)$/,
    loader: "babel-loader",
    exclude: /node_modules/,
    options: {
      presets: ["@babel/preset-typescript"],
      // plugins: ["@babel/plugin-transform-typescript"],
    },
    // loader: 'awesome-typescript-loader',
  }, 
  tsAntd: {
    test: /\.(ts|jsx|tsx|js)$/,
    loader: "babel-loader",
    exclude: /node_modules/,
    options: {
      presets: [
        ["babel-preset-react-app", { flow: false, typescript: true }],
      ],
      plugins: [
        [
          "import",
          {
            libraryName: "antd",
            libraryDirectory: "es",
            style: "css", // or true
          }
        ]
      ]
    }
  },
  styleCss: {
    test: /\.(css|less)$/,
    use: [
      "style-loader",
      "css-loader",
      {
        loader: "less-loader",
        options: {
          lessOptions: {
            javascriptEnabled: true,
          }
        }
      }
    ]
  }
}
const minimist_argv = minimist(process.argv.slice(2));
const mode = process.env.NODE_ENV = minimist_argv["NODE_ENV"] ? "development" : "production";
const devtool = minimist_argv["NODE_ENV"] ? "source-map" : 'nosources-source-map'//; "inline-source-map"//false// 
// require('source-map-support').install();
// export const copyTo=(from:string,to:{path:string,filename:string})=>new copywebpackplugin({
//   patterns: [
//     {
//       from,
//       to: path.join(to.path, to.filename),
//     }
//   ]
// })
process.on("unhandledRejection", (reason, p) => console.log("没有promise.catch", { p, reason }))
interface WebpackOpInterface extends webpack.Configuration {
  target: Exclude<webpack.Configuration["target"], (compiler?: any) => void>;
  entry: string;
  output: {
    path: string
    filename: string
  }
}
export type WebpackOpt = (webpackDist: string) => WebpackOpInterface;
let cpRef: {
  [k: string]: cp.ChildProcessWithoutNullStreams | cp.ChildProcess;
} = {}

export const output_webpackBuild = (opts: Array<WebpackOpInterface>, portStart = 8888): Promise<void> => new Promise(
  async (ok, err) => {
    const c1 = opts.map((v: webpack.Configuration) => merge(v, {
      mode,
      devtool,
      node: {
        __dirname: false,
        __filename: false,
      },
      resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        plugins: [new TsconfigPathsPlugin()],
      },
      // plugins: [
      //   new BundleAnalyzerPlugin({
      //     defaultSizes: "parsed",
      //     generateStatsFile: true,
      //     analyzerPort: portStart++,
      //   }),
      // ],
    })
    );
    const outPutParam = opts[0]["output"];
    if (!fs.existsSync(outPutParam.path)) {
      await fs.mkdir(outPutParam.path)
        .then(() => fs.existsSync(outPutParam.path))
        .catch(e => err(e))
    }
    const c2 = webpack(c1);
    const watchFile = path.join(outPutParam.path, outPutParam.filename)
    c2.watch({}, (optErr, stats) => {
      try {
        console.log("webpack watch", { mode, NODE_ENV: process.env.NODE_ENV, watchFile });
        if (optErr) {
          err({
            "webpack 配置错误": optErr,
            opts: util.inspect(c1, false, null),
          });
        } else if (stats && stats.hasErrors()) {
          err({
            "webpack watch错误": stats.toJson().errors,
            opts: util.inspect(c1, false, null),
          });
        } else if (mode == "development") {
          if (cpRef[watchFile]) {
            cpRef[watchFile].kill(9);
          }
          const cmd = opts[0]["target"] === "electron-main"
            ? require("electron") as any// require.resolve('electron')//path.resolve('node_modules/.bin/electron.cmd')//require("electron"),
            : 'node'
          cpRef[watchFile] = cp.spawn(cmd, [watchFile], { stdio: "inherit" })
          console.log("cp.spawn" + watchFile);
          ok()
        } else {
          ok()
        }
      } catch (e) {
        err(e)
      }
    })
  })

interface packagejsonOp {
  packname: string
  outputPath: string
  version: string
  homepage?: string
  repository?: string
  keywords?: string[]
}

const output_packagejson = ({
  outputPath,
  packname,
  version,
  homepage,
  repository,
  keywords,
}: packagejsonOp): Promise<any> => mode === "development"
    ? Promise.resolve()
    : fs.promises.writeFile(
      path.join(outputPath, "package.json"),
      JSON.stringify({
        name: packname,
        version,
        license: "MIT",
        keywords,
        homepage: (homepage || "https://github.com/see7788/") + packname, //项目主页的URL
        repository: repository || "https://see7788.com", //仓库信息
        main: "index.js",
      })
    ).then(() => fs.existsSync(path.join(outputPath, "package.json")))

export const output_electronBuild = (op: packagejsonOp & { icon: string }): Promise<any> => mode === "development"
  ? Promise.resolve()
  : output_packagejson(op)
    .then(() => electronBuilderMode.build({
      config: {
        appId: op.packname,
        icon: op.icon,
        directories: {
          app: op.outputPath,
          output: `${op.outputPath}_${op.packname}`,
        },
        mac: {
          target: ["dmg", "zip"],
        },
        win: {
          target: [
            {
              target: "nsis",
              arch: ["x64", "ia32"],
            },
          ],
        },
        nsis: {
          oneClick: false,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          allowToChangeInstallationDirectory: true,
        },
      },
    })
    )
    .then(() => console.log('output_electronBuild success'))
    .catch(console.log)

export const output_npm = (
  op: packagejsonOp & { __dirnamefilename: string, README: string }
) => Promise.resolve('start output_npm....')
  .then(() => output_webpackBuild(
    [{
      // node: {
      //   __dirname: false,
      //   __filename: false,
      // },
      // resolve: {
      //   extensions: [".js", ".jsx", ".ts", ".tsx"],
      //   plugins: [new TsconfigPathsPlugin()],
      // },
      output: {
        path: op.outputPath,
        filename: 'index.js',
      },
      entry: op.__dirnamefilename,
      target: 'node',
      module: {
        rules: [
          {
            test: /\.(js|jsx|ts|tsx)$/,
            loader: "babel-loader",
            exclude: /node_modules/,
            options: {
              presets: ["@babel/preset-typescript"],
            }
          }
        ]
      }
    }]))
  .then(() => console.log('success webpack'))
  .then(() => output_packagejson(op))
  .then(() => console.log('success packagejson'))
  .then(() => fs.writeFile(path.join(op.outputPath, "READE.me"), op.README))
  .then(() => new Promise((ok, err) => cp
    .exec(`cd ${op.outputPath}&& yarn publish --registry http://registry.npmjs.org`,
      (error, stdout, stderr) => error ? err(stderr) : ok(stdout)))
  )
  .then(() => console.log('success yarn publish'))
  .catch(console.error)


export default class <
  entry extends { __dirname: string, filename: string },
  output extends { path: string, filename: string },
  packagejson extends { name: string, version: string, icon: string } & { [k: string]: string }
  >{
  constructor(entry: entry, output: output, packagejson: packagejson) {
    const dev = minimist_argv["NODE_ENV"]
    output.path = path.join(output.path, dev ? '_dev' : '_pro')
    //this.output = output
    this.mkoutdir = () => fs.mkdir(output.path).then(() => fs.existsSync(output.path))
    this.packagejson = () => dev ? Promise.resolve() : fs.promises.writeFile(
      path.join(output.path, "package.json"),
      JSON.stringify(packagejson)
    ).then(() => fs.existsSync(path.join(output.path, "package.json")))
    this.config = {
      mode: process.env.NODE_ENV = dev ? "development" : "production",
      devtool: dev ? "source-map" : 'nosources-source-map',//; "inline-source-map"//false// ,
      entry,
      output,
      target: "node",
      module: {
        rules: [],
      },
      plugins: [],
      node: {
        __dirname: false,
        __filename: false,
      },
      optimization: {
        minimize: false//解决mysql打包后报错
      },
      resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        plugins: [new TsconfigPathsPlugin()],
      },
      // plugins: [
      //   new BundleAnalyzerPlugin({
      //     defaultSizes: "parsed",
      //     generateStatsFile: true,
      //     analyzerPort: portStart++,
      //   }),
      // ],
    }
    this.outWebpack = () => new Promise((ok, err) => {
      try {
        const watchFile = path.join(output.path, output.filename)
        const c2 = webpack(this.config)
        let wacth: cp.ChildProcessWithoutNullStreams | cp.ChildProcess;
        c2.watch({}, (optErr, stats) => {
          try {
            if (optErr) {
              console.error({
                "webpack 配置错误": optErr,
                opts: util.inspect(this.config, false, null),
              });
            } else if (stats && stats.hasErrors()) {
              console.error({
                "webpack watch错误": stats.toJson().errors,
                opts: util.inspect(this.config, false, null),
              });
            } else if (mode == "development") {
              if (wacth) {
                wacth.kill(9);
              }
              const cmd = this.config.target === "electron-main"
                ? require("electron") as any// require.resolve('electron')//path.resolve('node_modules/.bin/electron.cmd')//require("electron"),
                : 'node'
              wacth = cp.spawn(cmd, [watchFile], { stdio: "inherit" })
              console.log("cp.spawn" + watchFile);
            }
          } catch (e) {
            console.error(e)
          }
        })
        ok()
      } catch (e) {
        err(e)
      }
    })
    this.outElectronBuild = (): Promise<any> => dev
      ? Promise.resolve()
      : this.outWebpack()
        .then(this.packagejson)
        .then(() => fs.mkdir(output.path))
        .then(() => fs.existsSync(output.path))
        .then(() => electronBuilderMode.build({
          config: {
            appId: packagejson.name,
            icon: packagejson.icon,
            directories: {
              app: output.path,
              output: `${output.path}_${packagejson.name}`,
            },
            mac: {
              target: ["dmg", "zip"],
            },
            win: {
              target: [
                {
                  target: "nsis",
                  arch: ["x64", "ia32"],
                },
              ],
            },
            nsis: {
              oneClick: false,
              createDesktopShortcut: true,
              createStartMenuShortcut: true,
              allowToChangeInstallationDirectory: true,
            },
          },
        })
        )
  }
  private config: Parameters<typeof webpack>[0][0]
  private mkoutdir: () => Promise<any>
  private packagejson: () => Promise<any>
  outWebpack: () => Promise<void>
  outElectronBuild: () => Promise<void>
  plugins = {
    copy: (...fileOp: {
      entry: string, output: { path: string, filename: string }
    }[]) => {
      const c = new copywebpackplugin({
        patterns: fileOp.map(({ entry, output }) => ({
          from: entry,
          to: path.join(output.path, output.filename)
        }))
      })
      this.config.plugins?.push(c)
    }
  }
  loader = {
    ts: (type?: 'Antd') => type ? this.config.module?.rules.push({
      test: /\.(js|jsx|ts|tsx)$/,
      loader: "babel-loader",
      exclude: /node_modules/,
      options: {
        presets: ["@babel/preset-typescript"],
        // plugins: ["@babel/plugin-transform-typescript"],
      },
      // loader: 'awesome-typescript-loader',
    }) : this.config.module?.rules.push({
      test: /\.(ts|jsx|tsx|js)$/,
      loader: "babel-loader",
      exclude: /node_modules/,
      options: {
        presets: [
          ["babel-preset-react-app", { flow: false, typescript: true }],
        ],
        plugins: [
          [
            "import",
            {
              libraryName: "antd",
              libraryDirectory: "es",
              style: "css", // or true
            }
          ]
        ]
      }
    }),
    styleCss: () => this.config.module?.rules.push({
      test: /\.(css|less)$/,
      use: [
        "style-loader",
        "css-loader",
        {
          loader: "less-loader",
          options: {
            lessOptions: {
              javascriptEnabled: true,
            }
          }
        }
      ]
    })
  }
}