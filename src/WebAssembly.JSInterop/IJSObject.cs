using System;
namespace WebAssembly.JSInterop
{
    public interface IJSObject
    {
        object Invoke(string method, params object[] args);
    }
}
