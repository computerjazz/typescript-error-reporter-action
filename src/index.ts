import Module from 'module'
const path = require('path')
import * as fs from 'fs'
import { getInput, setFailed } from '@actions/core'
import { reporter, uploader } from './reporter'
import { CompilerOptions, Diagnostic, ParsedCommandLine } from "typescript"

type TS = typeof import('typescript')

async function main() {
  try {
    const project = getInput('project') || 'tsconfig.json'
    console.log('ROJECT!!', project)
    const projectPath = resolveProjectPath(path.resolve(process.cwd(), project))
    console.log("PROJ PATH!!", projectPath)
    if (projectPath == null) {
      throw new Error(`No valid typescript project was not found at: ${projectPath}`)
    }

    typecheck(projectPath)
  } catch (e) {
    console.error(e)
    setFailed(e)
  }
}

/**
 * Attempts to resolve ts config file and returns either path to it or `null`.
 */
const resolveProjectPath = (projectPath:string) => {
  console.log("RESOLVE PROJ PATH!!!", projectPath)
  console.log("PATH RESOLVE RESOLVE PROJ PATH!!!", path.resolve(projectPath))
  console.log("PATH RESOLVE RESOLVE package.json PATH!!!", path.resolve(projectPath, "package.json"))
  console.log("PATH RESOLVE RESOLVE src PATH!!!", path.resolve(projectPath, "src"))
  console.log("PATH RESOLVE RESOLVE src/main PATH!!!", path.resolve(projectPath, "src/main.js"))
  console.log("PATH RESOLVE RESOLVE ONLY src/main PATH!!!", path.resolve("src/main.js"))

  try {
    if (fs.statSync(projectPath).isFile()) {
      console.log("IS FILE!!", projectPath)
      return projectPath
    } else {
      console.log('resolving!!!', projectPath, "tsconfig.json")
      const projstats = fs.statSync(projectPath)
      console.log("PROJ STATS!!", projstats)
      const configPath = path.resolve(projectPath, "tsconfig.json")
      console.log('CONFIG PATH!!!', configPath)
      const stats = fs.statSync(configPath)
      console.log("stats!!!", stats)
      return stats.isFile() ? configPath : null
    }
  } catch (err) {
    console.log('caught!!!', err)
    return null
  }
}

const typecheck = (projectPath:string) => {
  const ts = loadTS(projectPath)
  const json = ts.readConfigFile(projectPath, ts.sys.readFile)
  const config = ts.parseJsonConfigFileContent(
      json.config,
      ts.sys,
      path.dirname(projectPath),
      undefined,
      path.basename(projectPath)
  );

  const errors = isIncrementalCompilation(config.options)
    ? performIncrementalCompilation(ts, projectPath)
    : performCompilation(ts, config)

  
  const errThreshold = Number(getInput('error_fail_threshold') || 0)
  const logString = `Found ${errors} errors!`
  console.log(logString)
  if (errors > errThreshold) {
    setFailed(logString)
  }
}



const performIncrementalCompilation = (ts:TS, projectPath:string) => {

  const report = reporter(ts)
  
  const host = ts.createSolutionBuilderHost(ts.sys, undefined, report, report)
  const builder = ts.createSolutionBuilder(host, [projectPath], { noEmit: true })
  return builder.build()
}


const performCompilation = (ts: TS, config:ParsedCommandLine) => {
  const upload = uploader(ts)
  const host = ts.createCompilerHost(config.options)
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
    projectReferences: config.projectReferences,
    configFileParsingDiagnostics: ts.getConfigFileParsingDiagnostics(config)
  })

  
  const configuration = program.getConfigFileParsingDiagnostics()
  let all:Diagnostic[] = [...program.getSyntacticDiagnostics()]
  if (all.length === 0) {
    all = [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics()
    ]

    if (all.length == 0) {
      all = [...program.getSemanticDiagnostics()]
    }
  }
  const diagnostics = ts.sortAndDeduplicateDiagnostics(all)

  upload(diagnostics.slice())
  return all.length
}

const isIncrementalCompilation = (options: CompilerOptions) =>
  options.incremental || options.composite

const loadTS = (projectPath:string):TS => {
  try {
    const require = Module.createRequire(projectPath)
    const ts = require('typescript')
    console.log(`Using local typescript@${ts.version}`);
    return ts
  } catch (error) {
    const ts = require('typescript')
    console.log(`Failed to find project specific typescript, falling back to bundled typescript@${ts.version}`);
    return ts
  }
}

main()
