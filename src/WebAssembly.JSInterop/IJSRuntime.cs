using System;
using System.Threading.Tasks;

namespace WebAssembly.JSInterop
{
    /// Represents an instance of a JavaScript runtime to which calls may be dispatched.
    /// <summary>
    /// </summary>
    public interface IJSRuntime
    {
        /// <summary>
        /// Invokes the specified JavaScript function asynchronously.
        /// </summary>
        /// <typeparam name="T">The JSON-serializable return type.</typeparam>
        /// <param name="identifier">An identifier for the function to invoke. For example, the value <code>"someScope.someFunction"</code> will invoke the function <code>window.someScope.someFunction</code>.</param>
        /// <param name="args">JSON-serializable arguments.</param>
        /// <returns>An instance of <typeparamref name="T"/> obtained by JSON-deserializing the return value.</returns>
        Task<T> InvokeAsync<T>(string identifier, params object[] args);
    }

}
