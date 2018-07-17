﻿using System;
using Microsoft.JSInterop;

namespace WebAssembly.JSInterop
{
    /// <summary>
    /// Abstract base class for an in-process JavaScript runtime.
    /// </summary>
    public abstract class JSInProcessRuntimeBase : JSRuntimeBase, IJSInProcessRuntime
    {
        /// <summary>
        /// Invokes the specified JavaScript function synchronously.
        /// </summary>
        /// <typeparam name="T">The JSON-serializable return type.</typeparam>
        /// <param name="identifier">An identifier for the function to invoke. For example, the value <code>"someScope.someFunction"</code> will invoke the function <code>window.someScope.someFunction</code>.</param>
        /// <param name="args">JSON-serializable arguments.</param>
        /// <returns>An instance of <typeparamref name="T"/> obtained by JSON-deserializing the return value.</returns>
        public T Invoke<T>(string identifier, params object[] args)
        {
            var resultJson = InvokeJS(identifier, Json.Serialize(args));
            Console.WriteLine(resultJson);
            return Json.Deserialize<T>(resultJson);
        }

        /// <summary>
        /// Performs a synchronous function invocation.
        /// </summary>
        /// <param name="identifier">The identifier for the function to invoke.</param>
        /// <param name="argsJson">A JSON representation of the arguments.</param>
        /// <returns>A JSON representation of the result.</returns>
        protected abstract string InvokeJS(string identifier, string argsJson);
    }}
