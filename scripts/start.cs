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

        // 双击 start.exe 时，在新 PowerShell 窗口中启动 start.ps1，
        // 让用户获得独立的 TUI 窗口。命令行直接调用 start.ps1 则默认在当前窗口运行。
        ProcessStartInfo psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-ExecutionPolicy Bypass -NoProfile -Command \"Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{Escape(ps1Path)}'\"",
            WorkingDirectory = exeDir,
            UseShellExecute = false,
            CreateNoWindow = false,
        };

        try
        {
            Process.Start(psi);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("启动失败: " + ex.Message);
            return 1;
        }
    }

    static string Escape(string path)
    {
        // 对 PowerShell 字符串中的单引号进行转义
        return path.Replace("'", "''");
    }
}
