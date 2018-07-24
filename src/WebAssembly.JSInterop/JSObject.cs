using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Reflection;

namespace WebAssembly.JSInterop
{
    public class JSObject : IJSObject, IDisposable
    {
        public int JSHandle;
        public GCHandle Handle;
        internal object RawObject;

        // Flag: Has Dispose already been called?
        bool disposed = false;

        public JSObject(int js_handle)
        {
            this.JSHandle = js_handle;
            this.Handle = GCHandle.Alloc(this);
        }

        internal JSObject(int js_id, object raw_obj)
        {

            this.JSHandle = js_id;
            this.Handle = GCHandle.Alloc(this);
            this.RawObject = raw_obj;
        }

        public object Invoke(string method, params object[] args)
        {
            int exception = 0;
            var res = Runtime.InvokeJSWithArgs(JSHandle, method, args, out exception);
            if (exception != 0)
                throw new JSException((string)res);
            return res;
        }


        protected void FreeHandle()
        {

#if DEBUG
            Console.WriteLine($"CS::Mono.WebAssembly.Runtime::FreeHandle {JSHandle}");
#endif
            //JSInterop.InvokeJS("BINDING.mono_wasm_free_handle(" + JSHandle + ");");
        }


        public override bool Equals(System.Object obj)
        {
            if (obj == null || GetType() != obj.GetType())
            {
                return false;
            }
            return JSHandle == (obj as JSObject).JSHandle;
        }

        public override int GetHashCode()
        {
            return JSHandle;
        }

        public void Dispose()
        {
            // Dispose of unmanaged resources.
            Dispose(true);
            // Suppress finalization.
            GC.SuppressFinalize(this);
        }

        // Protected implementation of Dispose pattern.
        protected virtual void Dispose(bool disposing)
        {
            if (disposed)
                return;

            if (disposing)
            {

                // Free any other managed objects here.
                //
            }

            // Free any unmanaged objects here.
            //
            FreeHandle();

            disposed = true;
        }


        public override string ToString()
        {
            return $"(js-obj js '{JSHandle}' mono '{(IntPtr)Handle} raw '{RawObject != null})";
        }
    }}


