using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

class Program
{
    static int Main(string[] args)
    {
        string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        string ps1Path = Path.Combine(exeDir, "start.ps1");

        if (!File.Exists(ps1Path))
        {
            Console.Error.WriteLine("找不到 start.ps1: " + ps1Path);
            return 1;
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = "powershell.exe";
        psi.Arguments = "-ExecutionPolicy Bypass -NoProfile -File \"" + ps1Path + "\"";
        psi.WorkingDirectory = exeDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = false;

        try
        {
            using (Process process = Process.Start(psi))
            {
                if (process != null)
                {
                    process.WaitForExit();
                    return process.ExitCode;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("启动失败: " + ex.Message);
            return 1;
        }

        return 0;
    }
}
