﻿using System;

namespace WebAssembly.JSInterop
{
    /// <summary>
    /// Represents errors that occur during an interop call from .NET to JavaScript.
    /// </summary>
    public class JSException : Exception
    {
        /// <summary>
        /// Constructs an instance of <see cref="JSException"/>.
        /// </summary>
        /// <param name="message">The exception message.</param>
        public JSException(string message) : base(message)
        {
        }
    }
}
